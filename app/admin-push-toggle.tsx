"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone, LoaderCircle, AlertTriangle, Send, Power } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {activeStoreId} from "@/lib/store-links";
import {notificationStorage, staffNotificationKey} from "@/lib/staff-notification-preferences";
import {checkStaffPush, matchesApplicationKey, readPushHint, savePushHint, urlBase64ToUint8Array, withPushTimeout as withTimeout, type PushState, type PushStatus} from "@/lib/staff-push-client";

let sessionDeviceId: string | undefined;
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  const storage = notificationStorage();
  let id: string|null|undefined;
  try {id=storage?.getItem("gaeru:device-id");} catch { /* Private mode can deny storage access. */ }
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    id = sessionDeviceId ?? "dev-" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    try {storage?.setItem("gaeru:device-id", id);} catch { /* Browser storage may be restricted. */ }
  }
  sessionDeviceId=id;
  return id;
}

export function AdminPushToggle({notify,iconOnly=false,userId}:{notify:(msg:string,kind?:"success"|"error"|"info")=>void;iconOnly?:boolean;userId:string|null}){
 const storeId=activeStoreId();
 return <span className={iconOnly?"aw-push-control":""}><PushControl key={JSON.stringify([storeId,userId])} notify={notify} storeId={storeId} userId={userId}/></span>;
}
function PushControl({ notify, storeId, userId }: { notify: (msg: string,kind?:"success"|"error"|"info") => void;storeId:string;userId:string|null }) {
  const [state, setState] = useState<PushState>("checking");
  const [loading, setLoading] = useState(false);
  const [testTesting, setTestTesting] = useState(false);
  const [checkRevision,setCheckRevision]=useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [hint, setHint] = useState<"subscribed"|"ready"|null>(null);
  const preferenceKey=staffNotificationKey(storeId,userId);
  const generation=useRef(0);
  const actionBusy=useRef(false);
  const pushApi=useCallback(<T,>(path:string,options?:RequestInit)=>api<T>(path,options,storeId),[storeId]);
  const remember=useCallback((next:PushState)=>{setState(next);savePushHint(notificationStorage(),preferenceKey,next);},[preferenceKey]);

  useEffect(() => {
    let cancelled = false;
    let checking = false;

    const checkStatus = async () => {
      // Async boundary prevents synchronous setState inside effect
      await Promise.resolve();
      if (cancelled || checking || actionBusy.current) return;

      if (typeof window === "undefined") return;

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if ((() => Notification.permission)() === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      checking=true;
      const epoch=generation.current;
      try {
        const deviceId = getOrCreateDeviceId();
        const result = await checkStaffPush(
          () => pushApi<PushStatus>(`admin/push/status?deviceId=${encodeURIComponent(deviceId)}`),
          () => withTimeout(navigator.serviceWorker.getRegistration().then(reg => reg?.active ? reg.pushManager.getSubscription() : null), 4000),
          Notification.permission,
        );
        if (cancelled || epoch!==generation.current) return;
        // Permissions may have changed while the network check was pending.
        let next=Notification.permission==="denied"?"denied":Notification.permission!=="granted"&&result.state==="subscribed"?"ready":result.state;
        if (Notification.permission === "granted" && result.vapidKey && next === "ready") {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = reg?.active ? await reg.pushManager.getSubscription() : null;
            if (sub && matchesApplicationKey(sub, result.vapidKey)) {
              const rawKey = sub.getKey ? sub.getKey("p256dh") : null;
              const rawAuth = sub.getKey ? sub.getKey("auth") : null;
              const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";
              const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";
              if (p256dh && auth) {
                next = "subscribed";
                void pushApi("admin/push/subscribe", {
                  method: "POST",
                  body: JSON.stringify({ deviceId, subscription: { endpoint: sub.endpoint, keys: { p256dh, auth } } })
                }).catch(() => {});
              }
            }
          } catch { /* Auto-heal error ignored */ }
        }
        setVapidKey(result.vapidKey);
        remember(next);
      } catch {
        if (!cancelled && epoch===generation.current) setState("check_error");
      } finally {checking=false;}
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the browser-only display hint after hydration.
    setHint(readPushHint(notificationStorage(),preferenceKey));
    void checkStatus();
    const refresh=()=>{if(document.visibilityState==="visible")void checkStatus();};
    navigator.serviceWorker?.addEventListener("controllerchange",refresh);
    window.addEventListener("pageshow",refresh);
    document.addEventListener("visibilitychange",refresh);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("controllerchange",refresh);
      window.removeEventListener("pageshow",refresh);
      document.removeEventListener("visibilitychange",refresh);
    };
  }, [checkRevision,preferenceKey,pushApi,remember]);

  const handleSubscribe = async () => {
    if (actionBusy.current || !vapidKey) return;
    actionBusy.current=true;generation.current++;
    setLoading(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        notify("Quyền thông báo chưa được cấp trên trình duyệt.");
        setLoading(false);
        return;
      }

      const reg = await withTimeout(navigator.serviceWorker.ready, 5000);
      let sub = await reg.pushManager.getSubscription();
      if(sub&&!matchesApplicationKey(sub,vapidKey)){await sub.unsubscribe();sub=null;}

      if (!sub) {
        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      const rawKey = sub.getKey ? sub.getKey("p256dh") : null;
      const rawAuth = sub.getKey ? sub.getKey("auth") : null;

      const p256dh = rawKey
        ? btoa(String.fromCharCode(...new Uint8Array(rawKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : "";
      const auth = rawAuth
        ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : "";

      const deviceId = getOrCreateDeviceId();

      await pushApi("admin/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
          },
        }),
      });

      remember("subscribed");
      notify("Đã bật thông báo đẩy trên thiết bị này.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notify("Thiết bị này đã gắn với tài khoản khác. Vui lòng đăng xuất tài khoản cũ.");
      } else {
        notify((err as Error).message || "Không thể kích hoạt thông báo đẩy.");
      }
    } finally {
      actionBusy.current=false;
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (actionBusy.current) return;
    actionBusy.current=true;generation.current++;
    setLoading(true);

    try {
      const deviceId = getOrCreateDeviceId();
      let endpoint: string | undefined;

      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 4000);
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
        }
      } catch {
        // tolerate timeout
      }

      await pushApi("admin/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ deviceId, endpoint }),
      });

      // NOTE: We do NOT call sub.unsubscribe() so other store subscriptions remain intact
      remember("ready");
      setMenuOpen(false);
      notify("Đã tắt thông báo đẩy cho cửa hàng này trên máy.");
    } catch (err) {
      notify((err as Error).message || "Chưa tắt được thông báo. Vui lòng thử lại.");
    } finally {
      actionBusy.current=false;
      setLoading(false);
    }
  };

  const handleTestPush = async () => {
    if (testTesting) return;
    setTestTesting(true);

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await pushApi<{ success: boolean; delivered: number; error?: string;correlationId?:string }>("admin/push/test", {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });

      if (res.success) {
        notify("Dịch vụ push đã nhận yêu cầu. Hãy kiểm tra thông báo trên thiết bị.");
      } else {
        notify((res.error||"Gửi thử nghiệm không thành công.")+(res.correlationId&&!res.error?.includes(res.correlationId)?" Mã đối chiếu: "+res.correlationId+".":""),"error");
      }
    } catch (err) {
      notify((err as Error).message || "Lỗi khi gửi thông báo thử nghiệm.","error");
    } finally {
      setTestTesting(false);
    }
  };

  if(state==="check_error")return <button type="button" className="secondary icon-label" onClick={()=>{setState("checking");setCheckRevision(value=>value+1);}} title="Chưa kiểm tra được cấu hình push. Nhấn để thử lại."><AlertTriangle size={17}/><span>Kiểm tra lại thông báo đẩy</span></button>;
  if (state === "checking") {
    return (
      <button type="button" onClick={()=>notify("Đang xác minh thông báo đẩy ở nền. Bạn vẫn có thể sử dụng các chức năng khác.","info")} className="secondary icon-label" title={hint==="subscribed"?"Thông báo đẩy đã bật lần trước · Đang xác minh lại":"Đang xác minh thông báo đẩy ở nền"}>
        <Smartphone size={20} />
        <span>{hint==="subscribed"?"Push đã bật lần trước · Đang xác minh":"Đang xác minh thông báo đẩy"}</span>
      </button>
    );
  }

  if (state === "unsupported") {
    return (
      <button
        type="button"
        className="secondary icon-label opacity-75"
        title="Thiết bị chưa hỗ trợ Web Push. Trên iPhone/iPad: Hãy chọn Thêm vào Màn hình chính (PWA) để nhận thông báo."
        onClick={() => notify("Trình duyệt này chưa hỗ trợ Web Push. Trên iOS/iPadOS: Hãy nhấn biểu tượng Chia sẻ -> Thêm vào màn hình chính rồi mở ứng dụng.")}
      >
        <Smartphone size={20} />
        <span>Push chưa hỗ trợ</span>
      </button>
    );
  }

  if (state === "denied") {
    return (
      <button
        type="button"
        className="secondary icon-label border-amber-600/40 text-amber-700 bg-amber-50/70"
        title="Thông báo đang bị chặn. Vui lòng mở Cài đặt trình duyệt trên thiết bị để cấp quyền Thông báo."
        onClick={() => notify("Thông báo đang bị chặn trên trình duyệt. Vui lòng vào Cài đặt trình duyệt (Settings -> Notifications) để cho phép nhận thông báo.")}
      >
        <AlertTriangle size={17} className="text-amber-600" />
        <span>Thông báo bị chặn</span>
      </button>
    );
  }

  if (state === "server_disabled") {
    return (
      <button
        type="button"
        className="secondary icon-label opacity-70 cursor-not-allowed"
        title="Tính năng Web Push chưa được cấu hình VAPID trên máy chủ quán."
        onClick={() => notify("Tính năng Web Push chưa được bật trên máy chủ quán (thiếu cấu hình VAPID).")}
      >
        <Smartphone size={20} />
        <span>Push chưa cấu hình</span>
      </button>
    );
  }

  if (state === "subscribed") {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="secondary icon-label border-emerald-700/40 bg-emerald-50/80 text-emerald-900 font-medium"
          title="Thông báo đẩy đang hoạt động. Nhấn để thử hoặc tùy chỉnh."
          aria-expanded={menuOpen}
        >
          <Smartphone size={20} className="text-emerald-700" />
          <i className="aw-push-enabled" aria-hidden="true" />
          <span>Push đã bật</span>
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl text-sm"
            role="menu"
          >
            <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500">
              Nhận tin đơn mới & gọi hỗ trợ khi tắt màn hình
            </div>
            <button
              type="button"
              disabled={testTesting}
              onClick={handleTestPush}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 text-slate-800 disabled:opacity-50"
            >
              {testTesting ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
              <span>Thử gửi thông báo</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleUnsubscribe}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-rose-50 text-rose-700 disabled:opacity-50"
            >
              <Power size={15} />
              <span>Tắt trên máy này</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleSubscribe}
      className="secondary icon-label"
      title="Bật thông báo đẩy để nhận tin đơn gọi món và khách gọi nhân viên khi không nhìn màn hình."
    >
      {loading ? <LoaderCircle size={17} className="animate-spin text-emerald-600" /> : <Smartphone size={20} />}
      <span>{state==="key_changed"?"Cập nhật đăng ký thông báo đẩy":"Bật thông báo đẩy"}</span>
    </button>
  );
}
