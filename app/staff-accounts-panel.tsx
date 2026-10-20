"use client";
import {StaffProfileEditor} from "./staff-profile-editor";
import {withStore} from "@/lib/store-links";

import {useCallback, useEffect, useId, useMemo, useRef, useState} from "react";
import {Check, CheckCircle2, ChevronDown, CircleAlert, Copy, History, KeyRound, LoaderCircle, LockKeyhole, LogOut, Mail, Pencil, RefreshCw, Search, ShieldCheck, ShieldOff, UserPlus, UserRound, UsersRound, X} from "lucide-react";
import {api, ApiError} from "@/lib/api-client";
import {ORDER_VIEW_DEPENDENTS, PERMISSIONS, ROLE_PRESETS, normalizePermissions, normalizeStaffEmail} from "@/lib/staff-permissions";
import type {Permission, StaffAccess, StaffProfile, StaffAccount, StaffAudit, StaffRole} from "@/lib/staff-permissions";
import "./staff-accounts-panel.css";

export type StaffAccountsPanelProps = {access: StaffAccess; onAccessRefresh?: () => Promise<void>};
type AccountSnapshot = {accounts: StaffAccount[]; audit: StaffAudit[]};
type AccountDraft = {email: string; name: string; role: StaffRole; permissions: Permission[]; status: "active" | "suspended"};
type AccountAttempt = AccountDraft & {id?: string; expectedVersion?: number};
type EditorState = {account: StaffAccount | null; intent: "edit" | "suspend" | "reactivate"};
type AccountFilter = "all" | "active" | "suspended";

const dateTime = (value: number | null) => value == null ? "Chưa đăng nhập" : new Intl.DateTimeFormat("vi-VN", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh"}).format(new Date(value));
const roleLabel = (account: Pick<StaffAccount, "protected" | "role">) => account.protected ? "Quản lý / Chủ cửa hàng" : ROLE_PRESETS.find(role => role.id === account.role)?.label || "Tùy chỉnh";
const withinScope = (permissions: readonly Permission[], access: StaffAccess) => permissions.every(permission => access.permissions.includes(permission));
const isOwnAccount = (account: StaffAccount, access: StaffAccess) => account.id === access.account?.id || account.email.toLowerCase() === access.email?.toLowerCase();
const canEditAccount = (account: StaffAccount, access: StaffAccess) => access.isStaff && access.permissions.includes("staff.manage") && !account.protected && !isOwnAccount(account, access) && withinScope(account.permissions, access);
const signature = (value: AccountDraft) => JSON.stringify({email: value.email.trim().toLowerCase(), name: value.name.trim().replace(/\s+/g, " "), role: value.role, permissions: [...value.permissions].sort(), status: value.status});
const accountDraft = (account: StaffAccount): AccountDraft => ({email: account.email, name: account.name, role: account.role, permissions: [...account.permissions], status: account.status});

function PermissionSummary({permissions, expanded = false}: {permissions: Permission[]; expanded?: boolean}) {
  const content = <ul className="sa-permission-tags">{PERMISSIONS.filter(permission => permissions.includes(permission.id)).map(permission => <li key={permission.id}><Check size={16}/><span>{permission.label}</span></li>)}</ul>;
  if (expanded) return content;
  return <details className="sa-permission-details"><summary><KeyRound size={18}/><span>Xem {permissions.length} quyền được cấp</span><ChevronDown size={18}/></summary>{content}</details>;
}

function StaffAccountEditor({account, latestAccount, intent, access, accounts, onClose, onSaved, onRefresh}: {
  account: StaffAccount | null; latestAccount: StaffAccount | null; intent: EditorState["intent"]; access: StaffAccess; accounts: StaffAccount[];
  onClose: () => void; onSaved: (account: StaffAccount, message: string) => void; onRefresh: () => Promise<StaffAccount[]>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorElement = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const saveLock = useRef(false);
  const attempt = useRef<AccountAttempt | null>(null);
  const [baseline, setBaseline] = useState(account);
  const [draft, setDraft] = useState<AccountDraft>(() => {
    if (account) return {...accountDraft(account), status: intent === "suspend" ? "suspended" : intent === "reactivate" ? "active" : account.status};
    const service = ROLE_PRESETS.find(role => role.id === "service" && withinScope(role.permissions, access));
    return {email: "", name: "", role: service?.id || "custom", permissions: service ? [...service.permissions] : [], status: "active"};
  });
  const initialDraft = useRef(signature(draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [forceConflict, setForceConflict] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [confirmSuspension, setConfirmSuspension] = useState(false);
  const statusOnly = intent !== "edit";
  const dirty = baseline ? signature(draft) !== signature(accountDraft(baseline)) : signature(draft) !== initialDraft.current;
  const conflict = forceConflict || Boolean(baseline && latestAccount && latestAccount.version !== baseline.version);
  const authorized = access.permissions.includes("staff.manage") && (!baseline || canEditAccount(latestAccount || baseline, access));
  const locked = busy || uncertain || !authorized;
  const duplicate = !baseline && accounts.some(value => value.email.toLowerCase() === draft.email.trim().toLowerCase());
  const valid = draft.name.trim().length > 0 && draft.name.trim().length <= 80 && Boolean(normalizeStaffEmail(draft.email)) && draft.permissions.length > 0 && withinScope(draft.permissions, access) && !duplicate;
  const groups = [...new Set(PERMISSIONS.map(permission => permission.group))];

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    heading.current?.focus({preventScroll: true});
    return () => {alive.current = false; document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus({preventScroll: true});};
  }, []);

  useEffect(() => {if (error) errorElement.current?.focus({preventScroll: false});}, [error]);

  function update(change: Partial<AccountDraft>) {
    if (locked) return;
    setDraft(current => ({...current, ...change}));
    setError(""); setDiscard(false); setConfirmSuspension(false);
  }

  function togglePermission(permission: Permission, checked: boolean) {
    const chosen = checked ? [...draft.permissions, permission] : draft.permissions.filter(value => value !== permission && (permission !== "orders.view" || !ORDER_VIEW_DEPENDENTS.includes(value)));
    update({permissions: normalizePermissions(chosen), role: "custom"});
  }

  function close() {
    if (saveLock.current) return;
    if (uncertain || (!statusOnly && dirty)) {setDiscard(true); return;}
    onClose();
  }

  function finish(saved: StaffAccount, checked = false) {
    attempt.current = null;
    setUncertain(false);
    const action = !baseline ? "Đã thêm tài khoản " : saved.status === "suspended" && baseline.status !== "suspended" ? "Đã tạm ngưng tài khoản " : saved.status === "active" && baseline.status === "suspended" ? "Đã kích hoạt lại tài khoản " : "Đã cập nhật quyền cho ";
    onSaved(saved, (checked ? "Đã kiểm tra kết quả. " : "") + action + saved.name + ".");
  }

  async function reconcile(sent: AccountAttempt): Promise<"saved" | "changed" | "unchanged"> {
    const fresh = await onRefresh();
    if (!alive.current) return "unchanged";
    const current = fresh.find(value => sent.id ? value.id === sent.id : value.email.toLowerCase() === sent.email.toLowerCase());
    if (current && signature(accountDraft(current)) === signature(sent) && (!sent.id || current.version > (sent.expectedVersion || 0))) {
      finish(current, true);
      return "saved";
    }
    if (current && (!sent.id || current.version !== sent.expectedVersion)) {
      attempt.current = null; setUncertain(false);
      if (sent.id) setForceConflict(true);
      setError(sent.id ? "Tài khoản đã được cập nhật ở màn hình khác. Bản đang chỉnh vẫn được giữ. Hãy dùng thông tin mới nhất rồi kiểm tra lại quyền trước khi lưu." : "Email này đã có tài khoản. Hãy quay lại danh sách để xem và chỉnh quyền của tài khoản đó.");
      return "changed";
    }
    return "unchanged";
  }

  async function useLatest() {
    if (saveLock.current) return;
    saveLock.current = true; setBusy(true); setError("");
    try {
      const fresh = await onRefresh();
      if (!alive.current) return;
      const current = fresh.find(value => value.id === baseline?.id);
      if (!current) throw new Error("Chưa tìm thấy thông tin tài khoản mới nhất. Hãy trở lại danh sách và tải lại.");
      setBaseline(current); setDraft({...accountDraft(current), status: intent === "suspend" ? "suspended" : intent === "reactivate" ? "active" : current.status});
      setForceConflict(false); setUncertain(false); setDiscard(false); setConfirmSuspension(false); attempt.current = null;
    } catch (reason) {if (alive.current) setError(reason instanceof Error ? reason.message : "Chưa tải được thông tin mới nhất.");}
    finally {saveLock.current = false; if (alive.current) setBusy(false);}
  }

  async function save() {
    if (saveLock.current || discard || !authorized || (!attempt.current && (!valid || conflict || (!dirty && baseline)))) return;
    if (!attempt.current && !statusOnly && baseline?.status === "active" && draft.status === "suspended" && !confirmSuspension) {setConfirmSuspension(true); return;}
    const sent: AccountAttempt = attempt.current || {...draft, email: draft.email.trim().toLowerCase(), name: draft.name.trim().replace(/\s+/g, " "), permissions: normalizePermissions(draft.permissions), ...(baseline ? {id: baseline.id, expectedVersion: baseline.version} : {})};
    attempt.current = sent;
    saveLock.current = true; setBusy(true); setError(""); setDiscard(false);
    try {
      if (uncertain) {
        const outcome = await reconcile(sent);
        if (!alive.current || outcome !== "unchanged") return;
      }
      const result = await api<{ok: true; account: StaffAccount}>("admin/accounts", {method: sent.id ? "PATCH" : "POST", body: JSON.stringify(sent)});
      if (!alive.current) return;
      if (!result.ok || !result.account || result.account.email !== sent.email || (sent.id && result.account.id !== sent.id)) throw new ApiError("Chưa xác nhận được kết quả lưu tài khoản.", null, true);
      finish(result.account);
    } catch (reason) {
      if (!alive.current) return;
      const mayHaveSaved = reason instanceof ApiError && reason.uncertain;
      if (mayHaveSaved || (reason instanceof ApiError && reason.status === 409)) {
        if (mayHaveSaved) setUncertain(true);
        try {if (await reconcile(sent) !== "unchanged") return;} catch { /* Keep the exact attempted write for a safe retry. */ }
        if (!alive.current) return;
        if (mayHaveSaved) setError("Chưa nhận được kết quả lưu. Nội dung được giữ nguyên. Bấm “Kiểm tra & thử lại” để đối chiếu và tiếp tục đúng yêu cầu này.");
        else {attempt.current = null; setUncertain(false); setForceConflict(Boolean(sent.id)); setError(reason instanceof Error ? reason.message : "Thông tin tài khoản vừa thay đổi. Hãy kiểm tra lại.");}
      } else {
        attempt.current = null; setUncertain(false);
        setError(reason instanceof Error ? reason.message : "Chưa lưu được tài khoản. Vui lòng thử lại.");
      }
    } finally {saveLock.current = false; if (alive.current) setBusy(false);}
  }

  const title = !baseline ? "Thêm tài khoản nhân viên" : intent === "suspend" ? "Tạm ngưng tài khoản" : intent === "reactivate" ? "Kích hoạt lại tài khoản" : "Chỉnh sửa tài khoản & quyền";
  const suspending = draft.status === "suspended" && baseline?.status === "active";
  return <dialog ref={dialog} className={"staff-account-dialog" + (statusOnly ? " sa-status-dialog" : "")} aria-labelledby={id + "-heading"} onCancel={event => {event.preventDefault(); close();}}>
    <header className="sa-dialog-header"><div><span className="sa-eyebrow">TÀI KHOẢN NHÂN VIÊN</span><h2 id={id + "-heading"} ref={heading} tabIndex={-1}>{title}</h2>{baseline && <p>{baseline.name} · {baseline.email}</p>}</div><button type="button" className="sa-close" aria-label="Đóng bảng tài khoản" disabled={busy} onClick={close}><X size={25}/></button></header>
    <form className="sa-account-form" onSubmit={event => {event.preventDefault(); void save();}}>
      <div className="sa-dialog-body">
        {error && <div ref={errorElement} tabIndex={-1} className="sa-notice error" role="alert"><CircleAlert size={23}/><p>{error}</p></div>}
        {!authorized && <div className="sa-notice error" role="alert"><LockKeyhole size={23}/><p>Quyền của bạn vừa thay đổi. Bạn không còn được chỉnh sửa tài khoản này. Đóng bảng để xem thông tin mới nhất.</p></div>}
        {conflict && !uncertain && <div className="sa-notice warning" role="status"><RefreshCw size={23}/><div><p>Có thay đổi mới từ màn hình khác. Nội dung đang chỉnh chưa bị thay thế.</p><button type="button" className="sa-secondary" disabled={busy} onClick={() => void useLatest()}>Bỏ bản đang chỉnh, dùng thông tin mới nhất</button></div></div>}
        {uncertain && <p className="sa-form-hint">Các trường đang được giữ nguyên trong lúc kiểm tra kết quả để tránh ghi đè nhầm quyền.</p>}
        {statusOnly ? <div className={"sa-status-confirm " + (intent === "suspend" ? "suspending" : "")}>
          {intent === "suspend" ? <ShieldOff size={40}/> : <ShieldCheck size={40}/>}<h3>{intent === "suspend" ? "Ngưng quyền truy cập của " : "Cho phép đăng nhập lại: "}{baseline?.name}?</h3>
          <p>{intent === "suspend" ? "Nhân viên này sẽ không thể thực hiện thao tác quản trị sau khi xác nhận. Lịch sử đơn hàng và các thao tác đã thực hiện vẫn được giữ." : "Nhân viên này sẽ có thể truy cập trang quản trị với các quyền đã được cấp dưới đây."}</p>
          <PermissionSummary permissions={draft.permissions} expanded/>
        </div> : <>
          <fieldset className="sa-identity-fields" disabled={locked}><legend>Thông tin đăng nhập</legend>
            <label htmlFor={id + "-name"}>Tên nhân viên<input id={id + "-name"} name="staff-name" type="text" autoComplete="off" maxLength={80} required value={draft.name} placeholder="Ví dụ: Nguyễn Minh" onChange={event => update({name: event.target.value})}/></label>
            <label htmlFor={id + "-email"}>Email đăng nhập<input id={id + "-email"} name="staff-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required readOnly={Boolean(baseline)} aria-describedby={id + "-email-hint"} value={draft.email} placeholder="nhanvien@example.com" onChange={event => update({email: event.target.value})}/></label>
            <p id={id + "-email-hint"} className="sa-form-hint">{baseline ? "Email gắn với danh tính đăng nhập và không sửa tại đây. Muốn dùng email khác, hãy tạm ngưng tài khoản cũ rồi thêm tài khoản mới." : "Dùng đúng email tài khoản ChatGPT của nhân viên. Sau khi thêm, nhân viên đăng nhập bằng email này để sử dụng quyền được cấp."}</p>
            {duplicate && <p className="sa-field-error" role="alert">Email này đã có trong danh sách. Hãy chọn tài khoản hiện có để chỉnh quyền.</p>}
          </fieldset>
          <fieldset className="sa-role-field" disabled={locked}><legend>Chọn nhóm quyền</legend><p className="sa-form-hint">Chọn một vai trò có sẵn, hoặc đánh dấu từng quyền bên dưới.</p><div className="sa-role-presets">{ROLE_PRESETS.map(role => <button key={role.id} type="button" aria-pressed={draft.role === role.id} disabled={locked || (role.id !== "custom" && !withinScope(role.permissions, access))} onClick={() => update({role: role.id, permissions: role.id === "custom" ? draft.permissions : [...role.permissions]})}><strong>{role.label}</strong><small>{role.description}</small></button>)}</div></fieldset>
          <div className="sa-permissions-heading"><div><h3>Quyền chi tiết</h3><p>{draft.permissions.length}/{PERMISSIONS.length} quyền được chọn</p></div><KeyRound size={26}/></div>
          {!access.isOwner && <p className="sa-form-hint">Bạn chỉ cấp được các quyền mình đang có, và chỉ chỉnh được tài khoản nằm trong phạm vi quyền đó.</p>}
          <div className="sa-permission-groups">{groups.map(group => <fieldset key={group} disabled={locked}><legend>{group}</legend>{PERMISSIONS.filter(permission => permission.group === group).map(permission => <label key={permission.id} className={"sa-permission-option" + (draft.permissions.includes(permission.id) ? " checked" : "")}>
            <input type="checkbox" checked={draft.permissions.includes(permission.id)} disabled={locked || !withinScope([permission.id], access)} onChange={event => togglePermission(permission.id, event.target.checked)}/><span><strong>{permission.label}</strong><small>{permission.description}</small></span>
          </label>)}</fieldset>)}</div>
          {draft.permissions.some(permission => ORDER_VIEW_DEPENDENTS.includes(permission)) && <p className="sa-form-hint">Quyền xử lý đơn, bàn và thu tiền cần kèm quyền xem đơn. Bỏ “Xem đơn” sẽ bỏ các quyền phụ thuộc này.</p>}
          {draft.permissions.length === 0 && <p className="sa-field-error">Chọn ít nhất một quyền. Để ngưng quyền truy cập, hãy chuyển tài khoản sang “Tạm ngưng”.</p>}
          {draft.permissions.includes("staff.manage") && <div className="sa-notice warning"><ShieldCheck size={23}/><p><strong>Được quản lý nhân viên:</strong> tài khoản này có thể thêm và phân quyền cho người khác trong phạm vi quyền được giao.</p></div>}
          <fieldset className="sa-status-field" disabled={locked}><legend>Trạng thái tài khoản</legend><label><input type="radio" name={id + "-status"} checked={draft.status === "active"} onChange={() => update({status: "active"})}/><span><strong>Hoạt động</strong><small>Cho phép đăng nhập với các quyền đã cấp.</small></span></label><label><input type="radio" name={id + "-status"} checked={draft.status === "suspended"} onChange={() => update({status: "suspended"})}/><span><strong>Tạm ngưng</strong><small>Dừng quyền truy cập; giữ lại lịch sử.</small></span></label></fieldset>
        </>}
        {confirmSuspension && <div className="sa-notice warning" role="alert"><ShieldOff size={25}/><p>Xác nhận tạm ngưng <strong>{baseline?.name}</strong> ({baseline?.email})? Nhân viên sẽ mất quyền thao tác quản trị. Bấm <strong>Xác nhận tạm ngưng</strong> để lưu thay đổi.</p></div>}
      </div>
      <footer className="sa-dialog-footer">
        {discard ? <div className="sa-discard-confirm"><p>{uncertain ? "Kết quả lưu chưa được xác nhận. Bạn có thể đóng và kiểm tra lại trong danh sách tài khoản." : "Có thay đổi chưa lưu. Đóng bảng sẽ bỏ bản đang chỉnh."}</p><div><button type="button" className="sa-secondary" onClick={() => setDiscard(false)}>Tiếp tục chỉnh</button><button type="button" className="sa-secondary" onClick={onClose}>{uncertain ? "Đóng, xem danh sách" : "Bỏ thay đổi và đóng"}</button></div></div> : <><span className="sa-draft-state">{uncertain ? "Đang chờ xác nhận kết quả" : dirty || !baseline ? "Thay đổi chỉ áp dụng sau khi lưu" : "Chưa có thay đổi"}</span><div className="sa-dialog-actions"><button type="button" className="sa-secondary" disabled={busy} onClick={close}>Quay lại</button><button type="submit" className={suspending ? "sa-danger" : "sa-primary"} disabled={busy || !authorized || (!uncertain && (!valid || conflict || (!dirty && Boolean(baseline))))}>{busy ? <LoaderCircle size={22} className="spin"/> : suspending ? <ShieldOff size={22}/> : <Check size={22}/>}<span>{busy ? "Đang kiểm tra & lưu…" : uncertain ? "Kiểm tra & thử lại" : confirmSuspension || intent === "suspend" ? "Xác nhận tạm ngưng" : intent === "reactivate" ? "Kích hoạt lại tài khoản" : baseline ? "Lưu tài khoản & quyền" : "Thêm tài khoản"}</span></button></div></>}
      </footer>
    </form>
  </dialog>;
}

export function StaffAccountsPanel({access, onAccessRefresh}: StaffAccountsPanelProps) {
  const id = useId();
  const [editingProfile,setEditingProfile]=useState(false),[savedProfile,setSavedProfile]=useState<StaffProfile|undefined>();
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("profile")==="edit")setEditingProfile(true);},[]);
  const profile=(savedProfile?.updatedAt??0)>(access.profile?.updatedAt??0)?savedProfile:access.profile;
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loginLink, setLoginLink] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const loginInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const readEpoch = useRef(0);
  const accessRef = useRef(access);
  const refreshParent = useRef(onAccessRefresh);
  accessRef.current = access; refreshParent.current = onAccessRefresh;
  const canManage = access.isStaff && access.permissions.includes("staff.manage");

  const refresh = useCallback(async (): Promise<StaffAccount[]> => {
    if (!accessRef.current.isStaff || !accessRef.current.permissions.includes("staff.manage")) throw new Error("Bạn chưa được cấp quyền quản lý tài khoản nhân viên.");
    const epoch = ++readEpoch.current;
    if (alive.current) setLoading(true);
    try {
      const result = await api<AccountSnapshot>("admin/accounts", {cache: "no-store"});
      if (!Array.isArray(result.accounts) || !Array.isArray(result.audit)) throw new Error("Chưa đọc được danh sách tài khoản. Vui lòng tải lại.");
      if (alive.current && epoch === readEpoch.current) {setSnapshot(result); setError("");}
      return result.accounts;
    } catch (reason) {
      if (alive.current && epoch === readEpoch.current) {
        setError(reason instanceof Error ? reason.message : "Chưa tải được tài khoản nhân viên.");
        if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {setSnapshot(null); void refreshParent.current?.().catch(() => {});}
      }
      throw reason;
    } finally {if (alive.current && epoch === readEpoch.current) setLoading(false);}
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoginLink(window.location.origin + "/signin-with-chatgpt?return_to=" + encodeURIComponent(withStore("/?view=admin&tab=accounts")));
    return () => {alive.current = false; readEpoch.current += 1;};
  }, []);

  useEffect(() => {
    if (!canManage) {readEpoch.current += 1; setSnapshot(null); setEditor(null); setLoading(false); return;}
    void refresh().catch(() => {});
    const onVisible = () => {if (document.visibilityState === "visible") void refresh().catch(() => {});};
    const timer = window.setInterval(onVisible, 20_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); readEpoch.current += 1;};
  }, [canManage, access.account?.id, refresh]);

  const accounts = snapshot?.accounts || [];
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    return accounts.filter(account => (filter === "all" || account.status === filter) && (!keyword || (account.name + " " + account.email + " " + roleLabel(account)).toLocaleLowerCase("vi-VN").includes(keyword)));
  }, [accounts, query, filter]);
  const own = access.account;
  const ownName = profile?.fullName || own?.name || access.email || "Tài khoản quản trị";
  const activeCount = accounts.filter(account => !account.protected && account.status === "active").length;
  const suspendedCount = accounts.filter(account => !account.protected && account.status === "suspended").length;

  async function copyLoginLink() {
    try {await navigator.clipboard.writeText(loginLink); setCopyNotice("Đã sao chép liên kết đăng nhập. Anh có thể gửi liên kết này cho nhân viên.");}
    catch {loginInput.current?.focus(); loginInput.current?.select(); setCopyNotice("Chạm giữ vào liên kết bên dưới để sao chép và gửi cho nhân viên.");}
  }

  function saved(account: StaffAccount, message: string) {
    readEpoch.current += 1;
    setSnapshot(current => current ? {...current, accounts: current.accounts.some(value => value.id === account.id) ? current.accounts.map(value => value.id === account.id && value.version <= account.version ? account : value) : [account, ...current.accounts]} : {accounts: [account], audit: []});
    setEditor(null); setNotice(message); setError("");
    void refresh().catch(() => {}); void refreshParent.current?.().catch(() => {});
  }

  return <section className="staff-accounts-panel" aria-labelledby={id + "-heading"}>
    <header className="sa-panel-heading"><span className="sa-heading-icon"><UsersRound size={30}/></span><div><span className="sa-eyebrow">ĐỘI NGŨ CỦA QUÁN</span><h2 id={id + "-heading"}>Tài khoản & phân quyền</h2><p>Thông tin đăng nhập và quyền làm việc của từng nhân viên.</p></div></header>
    <section className="sa-own-profile" aria-labelledby={id + "-profile"}><div className="sa-profile-top"><button type="button" className="sa-avatar" aria-label="Thay đổi ảnh đại diện" onClick={()=>setEditingProfile(true)}>{profile?.avatar?<img src={profile.avatar} alt="Ảnh đại diện của bạn"/>:<UserRound size={30}/>}</button><div><span className="sa-eyebrow" id={id + "-profile"}>TÀI KHOẢN CỦA BẠN</span><h3>{ownName}</h3><p><Mail size={18}/><span>{profile?.contactEmail||access.email}</span></p>{profile?.phone&&<p className="sa-profile-phone">Điện thoại: {profile.phone}</p>}</div><a href={"/signout-with-chatgpt?return_to="+encodeURIComponent(withStore("/?view=admin&tab=accounts"))} target="_top" className="sa-secondary sa-signout"><LogOut size={20}/>Đăng xuất</a></div><div className="sa-profile-status"><span className={"sa-status " + (access.isStaff ? "active" : "suspended")}>{access.isStaff ? "Đang hoạt động" : "Chưa có quyền quản trị"}</span><span className="sa-role-tag"><ShieldCheck size={17}/>{own ? roleLabel(own) : "Nhân viên"}</span>{access.isOwner && <span className="sa-protected"><LockKeyhole size={17}/>Tài khoản được bảo vệ</span>}</div><button type="button" className="sa-secondary sa-edit-profile" onClick={()=>setEditingProfile(true)}><Pencil size={18}/>Chỉnh sửa hồ sơ</button>{editingProfile&&<StaffProfileEditor access={access} profile={profile} onClose={()=>setEditingProfile(false)} onSaved={async value=>{setSavedProfile(value);setEditingProfile(false);setNotice("Đã cập nhật hồ sơ cá nhân.");await onAccessRefresh?.();}}/>}<PermissionSummary permissions={access.permissions}/><p className="sa-profile-hint">{access.isOwner ? "Quản trị tổng có toàn bộ quyền quản trị trên các cửa hàng. Tài khoản này không thể bị nhân viên đổi quyền hoặc tạm ngưng." : "Quyền được chủ quán hoặc người phụ trách phân quyền cấp cho bạn. Bạn không tự đổi quyền hoặc trạng thái tài khoản của mình."}</p></section>
    {!canManage ? <div className="sa-notice"><ShieldCheck size={25}/><div><strong>Quyền của bạn đang được áp dụng</strong><p>Các mục quản trị và thao tác khả dụng được hiển thị theo quyền đã cấp. Liên hệ chủ quán khi cần thêm quyền làm việc.</p></div></div> : <>
      <section className="sa-staff-list" aria-labelledby={id + "-list"}><div className="sa-list-heading"><div><h3 id={id + "-list"}>Tài khoản nhân viên</h3><p><strong>{activeCount}</strong> đang hoạt động · <strong>{suspendedCount}</strong> tạm ngưng</p></div><div className="sa-list-actions"><button type="button" className="sa-secondary" disabled={loading} onClick={() => void refresh().catch(() => {})}><RefreshCw size={20} className={loading ? "spin" : ""}/><span>Tải lại</span></button><button type="button" className="sa-primary" disabled={!snapshot} onClick={() => {setNotice(""); setEditor({account: null, intent: "edit"});}}><UserPlus size={22}/>Thêm nhân viên</button></div></div>
        <div className="sa-share-link"><div><strong>Liên kết đăng nhập cho nhân viên</strong><p>Thêm tài khoản trước, sau đó gửi liên kết này. Nhân viên dùng đúng email đã được cấp quyền. Hệ thống không tự gửi thư mời.</p></div><div className="sa-copy-row"><input ref={loginInput} type="url" aria-label="Liên kết đăng nhập cho nhân viên" readOnly value={loginLink} onFocus={event => event.target.select()}/><button type="button" className="sa-secondary" disabled={!loginLink} onClick={() => void copyLoginLink()}><Copy size={20}/><span>Sao chép</span></button></div>{copyNotice && <p className="sa-copy-notice" role="status">{copyNotice}</p>}</div>
        {notice && <div className="sa-notice success" role="status"><CheckCircle2 size={23}/><p>{notice}</p></div>}
        {error && <div className="sa-notice error" role="alert"><CircleAlert size={23}/><p>{error}{snapshot ? " Danh sách bên dưới là lần tải gần nhất." : ""}</p></div>}
        <div className="sa-list-toolbar"><label className="sa-search"><Search size={22}/><span className="sr-only">Tìm tên hoặc email nhân viên</span><input type="search" placeholder="Tìm tên, email hoặc vai trò…" value={query} onChange={event => setQuery(event.target.value)}/></label><label className="sa-filter-label" htmlFor={id + "-filter"}>Trạng thái<select id={id + "-filter"} value={filter} onChange={event => setFilter(event.target.value as AccountFilter)}><option value="all">Tất cả tài khoản</option><option value="active">Đang hoạt động</option><option value="suspended">Tạm ngưng</option></select></label></div>
        {loading && !snapshot ? <div className="sa-empty" role="status"><LoaderCircle size={32} className="spin"/><p>Đang tải tài khoản nhân viên…</p></div> : filtered.length === 0 ? <div className="sa-empty"><UsersRound size={36}/><h4>{query || filter !== "all" ? "Không có tài khoản phù hợp" : "Chưa có tài khoản nhân viên"}</h4><p>{query || filter !== "all" ? "Thử tên, email hoặc trạng thái khác." : "Bấm Thêm nhân viên để cấp quyền làm việc cho đội ngũ của quán."}</p></div> : <div className="sa-account-grid">{filtered.map(account => {
          const ownAccount = isOwnAccount(account, access);
          const editable = canEditAccount(account, access);
          return <article className={"sa-account-card" + (account.status === "suspended" ? " is-suspended" : "")} key={account.id}><div className="sa-account-title"><span className="sa-account-avatar">{account.protected ? <ShieldCheck size={24}/> : <UserRound size={24}/>}</span><div><h4>{account.name}{ownAccount && <small>Bạn</small>}</h4><p>{account.email}</p></div></div><div className="sa-card-badges"><span className="sa-role-tag">{roleLabel(account)}</span><span className={"sa-status " + account.status}>{account.status === "active" ? "Hoạt động" : "Tạm ngưng"}</span></div><p className="sa-binding-state">{account.userBound ? "Đã liên kết với tài khoản đăng nhập" : "Chờ nhân viên đăng nhập lần đầu"}</p><PermissionSummary permissions={account.permissions}/>{account.lastLoginAt != null && <p className="sa-last-login">Đăng nhập gần nhất: <time dateTime={new Date(account.lastLoginAt).toISOString()}>{dateTime(account.lastLoginAt)}</time></p>}
            {editable ? <div className="sa-card-actions"><button type="button" className="sa-secondary" onClick={() => {setNotice(""); setEditor({account, intent: "edit"});}}><Pencil size={19}/>Chỉnh quyền</button><button type="button" className={"sa-secondary " + (account.status === "active" ? "sa-suspend" : "")} onClick={() => {setNotice(""); setEditor({account, intent: account.status === "active" ? "suspend" : "reactivate"});}}>{account.status === "active" ? <ShieldOff size={19}/> : <ShieldCheck size={19}/>}<span>{account.status === "active" ? "Tạm ngưng" : "Kích hoạt lại"}</span></button></div> : <p className="sa-readonly"><LockKeyhole size={17}/>{account.protected ? "Tài khoản được bảo vệ" : ownAccount ? "Không tự thay đổi quyền của mình" : "Ngoài phạm vi quyền được quản lý"}</p>}
          </article>;
        })}</div>}
      </section>
      {snapshot && snapshot.audit.length > 0 && <details className="sa-audit"><summary><History size={23}/><span>Lịch sử phân quyền gần đây</span><ChevronDown size={21}/></summary><p>Thời gian Việt Nam · {Math.min(snapshot.audit.length, 20)} thay đổi gần nhất.</p><ol>{snapshot.audit.slice(0, 20).map(entry => <li key={entry.id}><div><strong>{({created: "Thêm tài khoản", updated: "Cập nhật tài khoản & quyền", suspended: "Tạm ngưng tài khoản", reactivated: "Kích hoạt lại tài khoản"} as const)[entry.action]}</strong><span>{entry.accountEmail}</span><small>Thực hiện bởi {entry.actorEmail}</small></div><time dateTime={new Date(entry.createdAt).toISOString()}>{dateTime(entry.createdAt)}</time></li>)}</ol></details>}
    </>}
    {editor && canManage && <StaffAccountEditor key={editor.account?.id || "new-account"} account={editor.account} latestAccount={editor.account ? accounts.find(account => account.id === editor.account?.id) || null : null} intent={editor.intent} access={access} accounts={accounts} onClose={() => setEditor(null)} onSaved={saved} onRefresh={refresh}/>}
  </section>;
}
