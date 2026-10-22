"use client";

import { useCallback, useEffect, useId, useRef, useState, lazy, Suspense } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  BellRing,
  CakeSlice,
  Check,
  CheckCheck,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Coffee,
  Eye,
  Flame,
  Grid2X2,
  Landmark,
  Leaf,
  LoaderCircle,
  LogIn,
  LogOut,
  Mic,
  Minus,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Salad,
  Settings2,
  ShieldCheck,
  Soup,
  Store,
  Table2,
  UsersRound,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  WalletCards,
  X,
  ChartNoAxesCombined,
} from "lucide-react";

import { SignInForm } from "./signin-form";
import { ItemExtrasEditor } from "./item-extras-editor";
import { AdminScreenAwake } from "./admin-screen-awake";
import { DishImageField } from "./dish-image-field";
import { ShopLogoField } from "./shop-logo-field";
import { StoreSwitcher } from "./store-management";
import { withStore } from "@/lib/store-links";
import { hasPermission, type Permission, type StaffAccess } from "@/lib/staff-permissions";
import { OpenTableBoard } from "./open-table-board";
import { OrderQueue, type MutationOutcome } from "./order-queue";
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings, type ThemeSettings } from "@/lib/theme-settings";
import { DEFAULT_DISPLAY_SETTINGS, normalizeDisplaySettings, type DisplaySettings } from "@/lib/display-settings";
import { api, ApiError } from "@/lib/api-client";
import { AdaptiveScheduler } from "@/lib/adaptive-polling";
import { NewOrderPopup, useAdminOrderAlerts } from "./admin-order-alerts";
import { AdminPushToggle } from "./admin-push-toggle";
import { paymentLabels, type PaymentMethod } from "@/lib/revenue-types";
import { OpeningRequests, TableManagement, type AdminTableSession } from "./table-session-admin";
import type { Connection, TableSession } from "@/lib/table-sessions";
import {
  shopInitials,
  brandingRevision,
  categories,
  statuses,
  money,
  defaultShop,
  extrasFor,
  linePrice,
  salePrice,
  tastes,
  type Category,
  type MenuItem,
  type Promotion,
  type DiningTable,
  type Shop,
  type CartLine,
  type Order,
  type OrderStatus,
  type ServiceRequest,
} from "@/lib/menu";
import type { TableTransfer } from "@/lib/table-transfer-types";
import { AdminStartup, AdminWorkspace, AdminSettingsHome, AdminBack, operationalTabs } from "./admin-workspace";
import {
  type AdminData,
  DishPrice,
  Modal,
  FoodImage,
  time,
  date,
  OrderReceipt,
} from "./ordering-app";
import "./admin-workspace.css";

// Lazy-loaded secondary panels to keep the operational admin bundle lean
const RevenuePanel = lazy(() => import("./revenue-panel").then(m => ({ default: m.RevenuePanel })));
const StaffAccountsPanel = lazy(() => import("./staff-accounts-panel").then(m => ({ default: m.StaffAccountsPanel })));
const StoreManagement = lazy(() => import("./store-management").then(m => ({ default: m.StoreManagement })));
const DisplaySettingsPanel = lazy(() => import("./display-settings-panel").then(m => ({ default: m.DisplaySettingsPanel })));
const ThemeSettingsPanel = lazy(() => import("./theme-settings-panel").then(m => ({ default: m.ThemeSettingsPanel })));
const TablePaymentDialog = lazy(() => import("./table-payment-dialog").then(m => ({ default: m.TablePaymentDialog })));
const TableTransferDialog = lazy(() => import("./table-transfer-dialog").then(m => ({ default: m.TableTransferDialog })));

export default function AdminPanel({
  initialDashboard,
  staff,
  access,
  onAccessChange,
  ready,
  notify,
  onMenuRefresh,
  shop,
  onShopChange,
  displaySettings,
  onDisplaySettings,
  themeSettings,
  onThemeSettings,
}: {
  initialDashboard: Promise<AdminData> | null;
  staff: boolean;
  access: StaffAccess | null;
  onAccessChange: (access: StaffAccess) => void;
  ready: boolean;
  notify: (s: string) => void;
  onMenuRefresh: () => Promise<unknown>;
  shop: Shop;
  onShopChange: (shop: Shop) => void;
  displaySettings: DisplaySettings;
  onDisplaySettings: (value: DisplaySettings) => void;
  themeSettings: ThemeSettings;
  onThemeSettings: (value: ThemeSettings) => void;
}) {
  const bootstrapConsumed = useRef(false);
  const liveAccess = useRef(access);
  liveAccess.current = access;
  const can = (permission: Permission) => hasPermission(access, permission);
  const canOrders = can("orders.view"),
    canRevenue = can("revenue.view"),
    canTables = can("tables.manage"),
    canMenu = can("menu.manage"),
    canSettings = can("settings.manage"),
    canPay = can("payments.collect"),
    canTransfer = can("tables.transfer"),
    canCancel = can("orders.cancel");
  const permissionKey = JSON.stringify([access?.userId, staff, access?.permissions]);
  const adminTabs = [
    { id: "stores", label: "Quản trị tổng", icon: Store, allowed: !!access?.isOwner },
    { id: "orders", label: "Bàn", icon: Table2, allowed: canOrders },
    { id: "order-list", label: "Đơn món", icon: UtensilsCrossed, allowed: canOrders },
    { id: "support", label: "Hỗ trợ", icon: Bell, allowed: canOrders },
    { id: "home", label: "Cài đặt", icon: Settings2, allowed: staff },
    { id: "revenue", label: "Doanh thu", icon: ChartNoAxesCombined, allowed: canRevenue },
    { id: "menu", label: "Thực đơn", icon: UtensilsCrossed, allowed: canMenu },
    { id: "promotions", label: "Khuyến mãi", icon: Settings2, allowed: canMenu },
    { id: "tables", label: "Quản lý bàn", icon: QrCode, allowed: canTables },
    { id: "settings", label: "Cài đặt quán", icon: Settings2, allowed: canSettings },
    { id: "accounts", label: "Tài khoản", icon: UsersRound, allowed: staff },
  ].filter(item => item.allowed);
  const [reportOrderScope, setReportOrderScope] = useState<"orders.view" | "revenue.view">("orders.view");
  const [tablePaymentSessionId, setTablePaymentSessionId] = useState<string | null>(null);
  const [transferSession, setTransferSession] = useState<AdminTableSession | null>(null);
  const [mutationError, setMutationError] = useState("");
  const workingRef = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(""),
    [revenueRevision, setRevenueRevision] = useState(0),
    [reportOrder, setReportOrder] = useState<Order | null>(null);
  const [editPromotion, setEditPromotion] = useState<MenuItem | null>(null);
  const [keepAwake, setKeepAwake] = useState(false);
  const [audioSettings, setAudioSettings] = useState(false);
  const [deleteTable, setDeleteTable] = useState<DiningTable | null>(null);
  const [tabReady, setTabReady] = useState(false);
  const [tab, setTab] = useState("orders"),
    [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null),
    [editTable, setEditTable] = useState<(DiningTable & { creationRequestId?: string }) | null>(null),
    [cancelOrder, setCancelOrder] = useState<Order | null>(null),
    [reason, setReason] = useState(""),
    [confirmPaid, setConfirmPaid] = useState<Order | null>(null),
    [lastSync, setLastSync] = useState(0),
    [origin, setOrigin] = useState("");
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const busyKeysRef = useRef<Set<string>>(new Set());
  const isBusy = useCallback((key: string) => busyKeysRef.current.has(key), []);

  useEffect(() => {
    setMutationError("");
  }, [editItem, editTable, cancelOrder, confirmPaid]);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("tab");
    if (target && ["stores", "orders", "order-list", "support", "home", "revenue", "menu", "promotions", "tables", "settings", "accounts"].includes(target))
      setTab(target);
    setTabReady(true);
  }, []);

  function switchAdminTab(next: string) {
    if (!adminTabs.some(item => item.id === next)) return;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }

  function openPayment(order: Order) {
    if (!canPay) return;
    setPaymentMethod("");
    setConfirmPaid(order);
  }

  const [focusTableId, setFocusTableId] = useState<string | null>(null),
    [focusRevision, setFocusRevision] = useState(0);
  const notifications = useAdminOrderAlerts(displaySettings.popupSeconds);
  const alertUserId = useRef(access?.userId ?? null);

  function openTable(tableId: string) {
    if (!canOrders) return;
    setFocusTableId(tableId);
    setFocusRevision(n => n + 1);
    switchAdminTab("orders");
  }

  function openOrder(orderId?: string) {
    if (!canOrders) return;
    if (orderId) setFocusOrderId(orderId);
    switchAdminTab("order-list");
  }

  const polling = useRef(false),
    reloadEpoch = useRef(0);

  const reload = useCallback(
    async (force = false, throwOnError = false): Promise<AdminData | null> => {
      if (!staff || (polling.current && !force)) return null;
      const epoch = ++reloadEpoch.current;
      polling.current = true;
      try {
        const boot = !bootstrapConsumed.current && initialDashboard;
        bootstrapConsumed.current = true;
        const d = await (boot || api<AdminData>(["menu", "promotions", "settings"].includes(tab) ? "admin" : "admin?section=board"));
        if (epoch !== reloadEpoch.current) return null;
        const current = liveAccess.current;
        if (
          !current?.isStaff ||
          d.access.userId !== current.userId ||
          (d.access.account?.id === current.account?.id && (d.access.account?.version ?? 0) < (current.account?.version ?? 0))
        )
          return null;
        const allowOrders = hasPermission(d.access, "orders.view"),
          allowOpenings = hasPermission(d.access, "tables.manage");
        notifications.restrictAlerts(allowOrders, allowOpenings);
        notifications.observeDashboard(allowOrders ? d.orders : [], allowOpenings ? d.sessions : [], allowOpenings ? d.calls : []);
        onDisplaySettings(normalizeDisplaySettings(d.displaySettings));
        onThemeSettings(normalizeThemeSettings(d.themeSettings));
        setData(d);
        onShopChange(d.shop);
        onAccessChange(d.access);
        setLastSync(Date.now());
        setError("");
        return d;
      } catch (e) {
        if (epoch === reloadEpoch.current) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 403) {
            setData(null);
            notifications.resetAlerts();
            setReportOrder(null);
            setTransferSession(null);
            setTablePaymentSessionId(null);
            setConfirmPaid(null);
            setEditItem(null);
            setEditTable(null);
            setCancelOrder(null);
            try {
              const current = await api<{ access: StaffAccess }>("account");
              if (epoch === reloadEpoch.current) onAccessChange(current.access);
            } catch {}
          }
        }
        if (throwOnError) throw e;
        return null;
      } finally {
        if (epoch === reloadEpoch.current) polling.current = false;
      }
    },
    [staff, tab, initialDashboard, onShopChange, onDisplaySettings, onThemeSettings, onAccessChange, notifications.observeDashboard, notifications.restrictAlerts, notifications.resetAlerts]
  );

  const pollerRef = useRef<AdaptiveScheduler | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    const baseInterval = operationalTabs.includes(tab) ? 5000 : 30000;
    if (!pollerRef.current) {
      pollerRef.current = new AdaptiveScheduler({
        task: async () => {
          await reload(false, true);
        },
        baseIntervalMs: baseInterval,
        maxIntervalMs: 30000,
        pauseWhenHidden: true,
      });
      pollerRef.current.start();
    } else {
      pollerRef.current.setBaseInterval(baseInterval);
    }
    return () => {
      pollerRef.current?.stop();
      pollerRef.current = null;
      reloadEpoch.current += 1;
      polling.current = false;
    };
  }, [tab, reload]);

  useEffect(() => {
    if (alertUserId.current !== (access?.userId ?? null)) {
      notifications.resetAlerts();
      setData(null);
      alertUserId.current = access?.userId ?? null;
    }
    notifications.restrictAlerts(canOrders, canTables);
    if (!staff) {
      setData(null);
      notifications.resetAlerts();
    }
    if (!canOrders) setFocusTableId(null);
    if (!canPay) {
      setConfirmPaid(null);
      setTablePaymentSessionId(null);
    }
    if (!canTransfer) setTransferSession(null);
    if (!canMenu) {
      setEditItem(null);
      setEditPromotion(null);
    }
    if (!canTables) {
      setEditTable(null);
      setDeleteTable(null);
    }
    if (!canCancel) setCancelOrder(null);
    if (!hasPermission(access, reportOrderScope)) setReportOrder(null);
    if (tabReady && staff && !adminTabs.some(item => item.id === tab) && adminTabs[0]) switchAdminTab(adminTabs[0].id);
  }, [permissionKey, reportOrderScope, tab, tabReady, notifications.restrictAlerts, notifications.resetAlerts]);

  async function mutate(path: string, body: unknown, message: string, explicitKey?: string): Promise<boolean> {
    const outcome = await mutateWithOutcome(path, body, message, explicitKey);
    return typeof outcome === "boolean" ? outcome : (outcome.state === "confirmed" || outcome.state === "committed_stale");
  }

  async function mutateWithOutcome(path: string, body: unknown, message: string, explicitKey?: string): Promise<MutationOutcome> {
    const payload = body as Record<string, unknown>;
    const permission: Permission | undefined =
      path === "order"
        ? payload.action === "paid"
          ? "payments.collect"
          : payload.status === "cancelled"
          ? "orders.cancel"
          : "orders.manage"
        : ({
            session: "tables.manage",
            table: "tables.manage",
            call: "tables.manage",
            item: "menu.manage",
            promotion: "menu.manage",
            shop: "settings.manage",
            "display-settings": "settings.manage",
            "theme-settings": "settings.manage",
          } as Record<string, Permission>)[path];
    if (!permission || !can(permission)) {
      const message = "Bạn chưa được cấp quyền thực hiện chức năng này.";
      setMutationError(message);
      notify(message);
      return { state: "rejected", message };
    }
    if (tab === "account-manager" && !hasPermission(liveAccess.current, "staff.manage")) {
      const message = "Bạn chưa được cấp quyền quản lý tài khoản nhân viên.";
      setMutationError(message);
      notify(message);
      return { state: "rejected", message };
    }
    const key = explicitKey || (payload.id ? `${path}:${payload.id}` : path);
    if (busyKeysRef.current.has(key)) return { state: "rejected", message: "Thao tác đang được xử lý..." };
    busyKeysRef.current.add(key);
    setBusyKeys(new Set(busyKeysRef.current));
    const isModalAction = (path !== "order" && path !== "session" && path !== "call") || payload.status === "cancelled" || payload.action === "paid";
    if (isModalAction) setWorking(true);
    setMutationError("");
    let writeCommitted = false;
    try {
      const result = await api<{ shop?: Shop; displaySettings?: DisplaySettings; themeSettings?: ThemeSettings }>("admin/" + path, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      writeCommitted = true;
      if (path === "display-settings" && result.displaySettings) {
        const confirmed = normalizeDisplaySettings(result.displaySettings);
        onDisplaySettings(confirmed);
        setData(current => (current ? { ...current, displaySettings: confirmed } : current));
      }
      if (path === "theme-settings" && result.themeSettings) {
        const confirmed = normalizeThemeSettings(result.themeSettings);
        onThemeSettings(confirmed);
        setData(current => (current ? { ...current, themeSettings: confirmed } : current));
      }
      if (path === "shop" && result.shop) {
        onShopChange(result.shop);
        setData(current => (current ? { ...current, shop: result.shop! } : current));
        window.dispatchEvent(new Event("store-branding-updated"));
      }
      if (path === "order" && payload.status && typeof payload.id === "string") {
        setData(current => {
          if (!current) return current;
          return {
            ...current,
            orders: current.orders.map(o => (o.id === payload.id ? { ...o, status: payload.status as Order["status"] } : o)),
          };
        });
      }
      setRevenueRevision(n => n + 1);
      try {
        await reload(true, true);
        pollerRef.current?.resetSchedule();
        void onMenuRefresh().catch(() => {});
        notify(message);
        return { state: "confirmed" };
      } catch {
        notify("Đã cập nhật · Chưa tải được dữ liệu mới");
        return { state: "committed_stale", message: "Đã cập nhật · Chưa tải được dữ liệu mới" };
      }
    } catch (e) {
      if (writeCommitted) {
        notify("Đã cập nhật · Chưa tải được dữ liệu mới");
        return { state: "committed_stale", message: "Đã cập nhật · Chưa tải được dữ liệu mới" };
      }
      if (e instanceof ApiError) {
        if (e.status === 409) {
          const msg = e.message || "Đơn đã được xử lý ở thiết bị khác.";
          setMutationError(msg);
          notify(msg);
          void reload(true).catch(() => {});
          return { state: "rejected", message: msg };
        }
        if (e.status === 403) {
          const msg = "Bạn chưa được cấp quyền thực hiện chức năng này.";
          setMutationError(msg);
          notify(msg);
          void reload(true).catch(() => {});
          return { state: "rejected", message: msg };
        }
        if (e.uncertain) {
          const msg = "Chưa nhận được xác nhận từ máy chủ. Vui lòng kiểm tra trước khi thử lại.";
          setMutationError(msg);
          notify(msg);
          return { state: "uncertain", message: msg };
        }
      }
      const err = e as Error;
      const isTimeout = err.name === "AbortError" || err.message?.toLowerCase().includes("timeout");
      const msg = isTimeout ? "Chưa nhận được xác nhận từ máy chủ. Vui lòng kiểm tra trước khi thử lại." : err.message || "Thao tác không thành công.";
      setMutationError(msg);
      notify(msg);
      return { state: isTimeout ? "uncertain" : "rejected", message: msg };
    } finally {
      busyKeysRef.current.delete(key);
      setBusyKeys(new Set(busyKeysRef.current));
      if (isModalAction) setWorking(false);
    }
  }

  async function sessionAction(id: string, action: "approve" | "reject" | "close") {
    return mutate(
      "session",
      { id, action },
      action === "approve"
        ? "Đã mở bàn. Máy của khách có thể gọi món."
        : action === "reject"
        ? "Đã từ chối yêu cầu. Bàn sẵn sàng nhận khách mới."
        : "Đã đóng bàn. Quyết toán và lịch sử lượt khách đã được lưu trong mục Doanh thu.",
      `session:${id}`
    );
  }

  if (!ready) return <AdminStartup />;
  if (!staff && !access?.authenticated)
    return (
      <SignInForm
        onAuthenticated={async () => {
          const d = await api<{ access: StaffAccess }>("account");
          onAccessChange(d.access);
        }}
      />
    );
  if (!staff)
    return (
      <main className="connection-error">
        <StoreSwitcher access={access} />
        <Store size={38} />
        <h1>
          {access?.authenticated
            ? access.account?.status === "suspended"
              ? "Tài khoản đã tạm khóa"
              : "Tài khoản chưa được cấp quyền"
            : "Khu vực dành cho nhân viên"}
        </h1>
        <p>
          {access?.authenticated ? (
            <>
              {access.email}
              <br />
              Liên hệ quản trị để được cấp hoặc mở lại quyền truy cập bằng đúng email này.
            </>
          ) : (
            "Đăng nhập bằng tài khoản được quản trị cấp quyền để sử dụng các chức năng phục vụ quán."
          )}
        </p>
        {access?.authenticated ? (
          <>
            <button className="primary" onClick={() => void onMenuRefresh().catch(error => notify((error as Error).message))}>
              <RefreshCw size={17} />
              Kiểm tra lại quyền
            </button>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  await api("auth/logout", { method: "POST" });
                } catch {}
                window.location.href = withStore("/?view=admin&tab=accounts");
              }}
            >
              <LogOut size={17} />
              Đăng xuất để đổi tài khoản
            </button>
          </>
        ) : (
          <a className="primary" href={"/signin?returnTo=" + encodeURIComponent(withStore("/?view=admin"))}>
            <LogIn size={18} />
            Đăng nhập quản trị
          </a>
        )}
      </main>
    );

  return (
    <AdminWorkspace
      shop={shop}
      access={access}
      tab={tab}
      onSwitch={switchAdminTab}
      onAudio={() => setAudioSettings(true)}
      onListen={() => {
        notifications.testSound();
        setKeepAwake(true);
      }}
      soundMode={notifications.soundMode}
      pushControl={<AdminPushToggle notify={notify} iconOnly />}
      soundReady={notifications.soundReady}
      canOrders={canOrders}
      canTables={canTables}
      pendingCount={data?.sessions.filter(s => s.status === "pending").length ?? 0}
      supportCount={data?.calls.length ?? 0}
      newOrdersCount={data?.orders.filter(o => o.status === "new").length ?? 0}
    >
      {!operationalTabs.includes(tab) && tab !== "home" && (
        <AdminBack title={adminTabs.find(t => t.id === tab)?.label ?? "Cài đặt"} onBack={() => switchAdminTab("home")} />
      )}
      {error && (
        <div className="inline-error">
          <AlertCircle size={18} />
          {error}
          <button onClick={() => void reload()}>Thử lại</button>
        </div>
      )}
      {!data ? (
        <div className="admin-loading">
          <LoaderCircle className="spin" />
          Đang tải dữ liệu…
        </div>
      ) : (
        <>
          {canTables && tab === "tables" && <OpeningRequests sessions={data.sessions} tables={data.tables} working={working} onAction={sessionAction} />}
          {tab === "stores" && access?.isOwner && (
            <Suspense fallback={<p role="status">Đang tải quản trị cửa hàng…</p>}>
              <StoreManagement />
            </Suspense>
          )}
          {tab === "home" && (
            <AdminSettingsHome
              tabs={[...adminTabs].sort(
                (a, b) =>
                  ["tables", "menu", "settings", "promotions", "revenue", "accounts", "stores"].indexOf(a.id) -
                  ["tables", "menu", "settings", "promotions", "revenue", "accounts", "stores"].indexOf(b.id)
              )}
              onSwitch={switchAdminTab}
              collected={data.stats.todayCollected}
              orderCount={data.stats.todayCount}
              activeTables={data.sessions.filter(s => s.status === "active").length}
              updated={lastSync ? time(lastSync) : "…"}
            />
          )}
          {operationalTabs.includes(tab) &&
            canOrders &&
            (tab === "order-list" ? (
              <OrderQueue
                orders={data.orders}
                tables={data.tables}
                permissions={access?.permissions ?? []}
                onOrderStatus={(order, next) => mutateWithOutcome("order", { id: order.id, status: next }, "Đã cập nhật trạng thái đơn.", `order:${order.id}`)}
                onCancel={order => {
                  setCancelOrder(order);
                  setReason("");
                }}
                onViewOrder={order => {
                  setReportOrderScope("orders.view");
                  setReportOrder(order);
                }}
                isBusy={id => isBusy(`order:${id}`)}
                focusOrderId={focusOrderId}
                onFocusHandled={() => setFocusOrderId(null)}
              />
            ) : (
              <OpenTableBoard
                key={tab}
                mode={tab === "support" ? "support" : "tables"}
                initialView={tab === "orders" ? "matrix" : "manage"}
                permissions={access?.permissions ?? []}
                tables={data.tables}
                sessions={data.sessions}
                orders={data.orders}
                calls={data.calls}
                transfers={data.transfers ?? []}
                working={working}
                isBusy={id => isBusy(`order:${id}`) || isBusy(`session:${id}`) || isBusy(`call:${id}`)}
                focusTableId={focusTableId}
                focusRevision={focusRevision}
                onSessionAction={sessionAction}
                onOrderStatus={(order, next) => mutate("order", { id: order.id, status: next }, "Đã cập nhật trạng thái đơn.", `order:${order.id}`)}
                onLineStatus={(orderId, orderLineId, toStatus, count) => mutate("order", { id: orderId, orderLineId, action: "line_transition", toStatus, count }, "Đã cập nhật tiến độ món.", `order:${orderId}`)}
                onResolveCall={call => mutate("call", { id: call.id, createdAt: call.created_at }, "Đã xác nhận hỗ trợ bàn.", `call:${call.id}`)}
                onTransfer={setTransferSession}
                onCollect={openPayment}
                onCollectTable={setTablePaymentSessionId}
                onCancel={order => {
                  setCancelOrder(order);
                  setReason("");
                }}
                onViewOrder={order => {
                  setReportOrderScope("orders.view");
                  setReportOrder(order);
                }}
              />
            ))}

          {tab === "revenue" && canRevenue && (
            <Suspense fallback={<p role="status">Đang tải báo cáo doanh thu…</p>}>
              <RevenuePanel
                canCollect={canPay}
                tables={data.tables}
                refreshKey={revenueRevision}
                onCollect={openPayment}
                onViewOrder={order => {
                  setReportOrderScope("revenue.view");
                  setReportOrder(order);
                }}
                notify={notify}
              />
            </Suspense>
          )}
          {["menu", "promotions", "settings"].includes(tab) && data.compact && <p role="status">Đang tải thiết lập cửa hàng…</p>}
          {tab === "menu" && canMenu && !data.compact && (
            <>
              <div className="section-heading menu-management-heading">
                <div>
                  <h2>Thực đơn của quán</h2>
                  <p>{data.items.length} món · Thay đổi được áp dụng cho lần gọi món tiếp theo.</p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    setEditItem({
                      name: "",
                      description: "",
                      category: "main",
                      price: 50000,
                      image: "/images/hero.webp",
                      badge: "",
                      available: 1,
                    })
                  }
                >
                  <Plus size={17} />
                  Thêm món
                </button>
              </div>
              <div className="manage-menu-list">
                {data.items.map(m => (
                  <div key={m.id} className="manage-menu-row">
                    <FoodImage src={m.image} alt={m.name} />
                    <div className="manage-menu-name">
                      <strong>{m.name}</strong>
                      <span>{categories.find(c => c.id === m.category)?.name}</span>
                    </div>
                    <div className="manage-price">
                      <DishPrice item={m} />
                      {m.promotion && (
                        <small className="promotion-state">
                          {!m.promotion.enabled
                            ? "Khuyến mại đã tắt"
                            : m.promotion.endsAt !== null && Date.now() >= m.promotion.endsAt
                            ? "Khuyến mại đã kết thúc"
                            : m.promotion.startsAt !== null && Date.now() < m.promotion.startsAt
                            ? "Khuyến mại đã hẹn giờ"
                            : "Khuyến mại đang áp dụng"}
                        </small>
                      )}
                    </div>
                    <button
                      className={"availability " + (m.available ? "available" : "")}
                      disabled={working}
                      onClick={() => void mutate("item", { id: m.id, toggle: m.available ? 0 : 1 }, m.available ? "Đã đánh dấu tạm hết món." : "Món đã sẵn sàng phục vụ.")}
                    >
                      <span />
                      {m.available ? "Đang bán" : "Tạm hết"}
                    </button>
                    <button className="icon-btn bordered" aria-label={"Chỉnh sửa " + m.name} onClick={() => setEditItem(m)}>
                      <Pencil size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "promotions" && canMenu && !data.compact && (
            <section>
              <div className="section-heading">
                <div>
                  <h2>Cài đặt khuyến mại</h2>
                  <p>Chọn món để cài mức giảm và thời gian áp dụng. Đơn đã đặt giữ nguyên giá.</p>
                </div>
              </div>
              <div className="manage-menu-list">
                {data.items.map(m => (
                  <div className="manage-menu-row" key={m.id}>
                    <FoodImage src={m.image} alt={m.name} />
                    <div className="manage-menu-name">
                      <strong>{m.name}</strong>
                      <span>
                        {!m.promotion?.enabled
                          ? "Chưa bật khuyến mại"
                          : m.promotion.endsAt !== null && Date.now() >= m.promotion.endsAt
                          ? "Đã kết thúc"
                          : m.promotion.startsAt !== null && Date.now() < m.promotion.startsAt
                          ? "Đã hẹn giờ"
                          : "Đang áp dụng"}
                      </span>
                    </div>
                    <div className="manage-price">
                      <DishPrice item={m} />
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        setMutationError("");
                        setEditPromotion(m);
                      }}
                    >
                      Cài khuyến mại
                    </button>
                  </div>
                ))}
              </div>
              {!data.items.length && <p>Thêm món trong Thực đơn trước khi cài khuyến mại.</p>}
            </section>
          )}
          {tab === "tables" && canTables && (
            <TableManagement
              tables={data.tables}
              sessions={data.sessions}
              orders={data.orders}
              shopName={shop.name}
              origin={origin}
              working={working}
              onAction={sessionAction}
              onEditTable={setEditTable}
              onAddTable={() =>
                setEditTable({
                  id: "",
                  token: "",
                  name: "Bàn " + String(Math.max(0, ...data.tables.map(t => Number(t.id) || 0)) + 1).padStart(2, "0"),
                  zone: "Sảnh chính",
                  creationRequestId: crypto.randomUUID(),
                })
              }
              onViewOrders={openTable}
              onDeleteTable={table => {
                setMutationError("");
                setDeleteTable(table);
              }}
            />
          )}
          {tab === "settings" && canSettings && !data.compact && (
            <Suspense fallback={<p role="status">Đang tải cài đặt quán…</p>}>
              <ThemeSettingsPanel shopName={shop.name} value={normalizeThemeSettings(data.themeSettings ?? themeSettings)} working={working} onSave={value => mutate("theme-settings", value, "Đã lưu màu giao diện và màu chữ cho quán.")} />
              <DisplaySettingsPanel value={normalizeDisplaySettings(data.displaySettings)} working={working} previewItem={data.items.find(item => !!item.available) || data.items[0]} onSave={value => mutate("display-settings", value, "Đã lưu thời gian thông báo, cỡ chữ và kích thước ảnh món.")} />
              <ShopForm key={brandingRevision(data.shop) + data.shop.open} shop={data.shop} working={working} onSave={s => mutate("shop", s, "Đã cập nhật thông tin quán.")} />
            </Suspense>
          )}
          {tab === "accounts" && access && (
            <Suspense fallback={<p role="status">Đang tải danh sách tài khoản…</p>}>
              <StaffAccountsPanel
                access={access}
                onAccessRefresh={async () => {
                  await reload(true);
                  await onMenuRefresh();
                }}
              />
            </Suspense>
          )}
        </>
      )}
      {audioSettings && (
        <Modal title="Thông báo & màn hình" onClose={() => setAudioSettings(false)}>
          <div className="form-body">
            <h3>Âm thanh thông báo</h3>
            <div className="aw-sound-modes" role="group" aria-label="Chế độ âm thanh">
              {([
                { id: "voice", label: "Giọng nói" },
                { id: "chime", label: "Âm báo" },
                { id: "silent", label: "Im lặng" },
              ] as const).map(mode => (
                <button
                  type="button"
                  data-audio-test="true"
                  key={mode.id}
                  aria-pressed={notifications.soundMode === mode.id}
                  className="secondary"
                  onClick={() => {
                    notifications.setSoundMode(mode.id);
                    if (mode.id !== "silent") notifications.testSound();
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p role="status">
              {notifications.soundMode === "silent"
                ? "Đã tắt âm thanh. Thông báo trên màn hình và push vẫn hoạt động."
                : notifications.soundMode === "chime"
                ? "Chỉ phát âm báo, không đọc giọng nói."
                : notifications.audioNotice || "Giọng đọc đã sẵn sàng."}
            </p>
            {notifications.soundMode !== "silent" && (
              <button
                type="button"
                data-audio-test="true"
                className="primary"
                onClick={() => {
                  notifications.testSound();
                  setKeepAwake(true);
                }}
              >
                <Volume2 size={18} />
                {notifications.soundMode === "chime" ? "Nghe thử âm báo" : "Nghe thử giọng đọc"}
              </button>
            )}
            <AdminScreenAwake enabled={keepAwake} onChange={setKeepAwake} />
            <button type="button" className="secondary" onClick={() => void reload()}>
              <RefreshCw size={18} />
              Tải lại dữ liệu
            </button>
            <StoreSwitcher access={access} />
            <a className="secondary" href={withStore("/")}>
              Xem thực đơn khách
            </a>
          </div>
        </Modal>
      )}
      {canOrders && !tablePaymentSessionId && !reportOrder && !transferSession && !confirmPaid && !editItem && !editTable && !cancelOrder && (
        <NewOrderPopup
          alert={notifications.active}
          waiting={notifications.waiting}
          durationMs={notifications.durationMs}
          onDismiss={notifications.dismiss}
          onOpenTable={openTable}
          onOpenOrder={openOrder}
          canSeeMoney={canPay}
        />
      )}
      {reportOrder && can(reportOrderScope) && (
        <Modal title={"Chi tiết đơn #" + reportOrder.code} onClose={() => setReportOrder(null)}>
          <div className="report-order-detail">
            <OrderReceipt order={reportOrder} />
          </div>
        </Modal>
      )}
      {canTransfer && transferSession && data && (
        <Suspense fallback={null}>
          <TableTransferDialog
            session={transferSession}
            tables={data.tables}
            sessions={data.sessions}
            orders={data.orders}
            calls={data.calls}
            onClose={() => setTransferSession(null)}
            onRefresh={async () => {
              await reload(true);
            }}
            onTransferred={result => {
              setTransferSession(null);
              setRevenueRevision(n => n + 1);
              setFocusTableId(result.session.table_id);
              setFocusRevision(n => n + 1);
              void reload(true);
              void onMenuRefresh().catch(() => {});
              notify(
                result.replayed
                  ? "Đã đồng bộ vị trí hiện tại của lượt khách: " + result.session.table_name + "."
                  : "Đã chuyển " + result.transfer.fromTableName + " sang " + result.transfer.toTableName + ". Toàn bộ thông tin lượt khách đã chuyển cùng bàn."
              );
            }}
          />
        </Suspense>
      )}
      {canPay && tablePaymentSessionId && (
        <Suspense fallback={null}>
          <TablePaymentDialog
            sessionId={tablePaymentSessionId}
            canClose={canTables && (() => {
              const sessionOrders = data?.orders.filter(o => o.dining_session_id === tablePaymentSessionId && o.status !== "cancelled") ?? [];
              return sessionOrders.length > 0 && sessionOrders.every(o => o.status === "served");
            })()}
            unservedCount={(() => {
              const sessionOrders = data?.orders.filter(o => o.dining_session_id === tablePaymentSessionId && o.status !== "cancelled") ?? [];
              return sessionOrders.filter(o => o.status !== "served").length;
            })()}
            onCloseSession={canTables ? async () => {
              const session = data?.sessions.find(s => s.id === tablePaymentSessionId);
              if (session) {
                setTablePaymentSessionId(null);
                await sessionAction(session.id, "close");
              }
            } : undefined}
            onClose={() => setTablePaymentSessionId(null)}
            onPaid={result => {
              setRevenueRevision(n => n + 1);
              void reload(true);
              void onMenuRefresh().catch(() => {});
              notify("Đã ghi nhận " + money(result.receipt.amount) + " cho " + result.receipt.orderIds.length + " lần gọi món của bàn.");
            }}
          />
        </Suspense>
      )}
      {canMenu && editPromotion && (
        <Modal title={"Khuyến mại · " + editPromotion.name} onClose={() => !working && setEditPromotion(null)}>
          <form
            className="form-body"
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const promotion = readPromotionForm(f, editPromotion.promotion);
              void mutate("promotion", { id: editPromotion.id, promotion }, "Đã lưu khuyến mại.").then(ok => {
                if (ok) setEditPromotion(null);
              });
            }}
          >
            <p>Giá gốc: {money(editPromotion.price)}</p>
            <PromotionFields initial={editPromotion.promotion} />
            {mutationError && (
              <p className="submission-error" role="alert">
                {mutationError}
              </p>
            )}
            <button className="primary full" disabled={working}>
              Lưu khuyến mại
            </button>
          </form>
        </Modal>
      )}
      {canMenu && editItem && (
        <Modal title={editItem.id ? "Chỉnh sửa món" : "Thêm món mới"} onClose={() => !working && setEditItem(null)}>
          <ItemForm
            initial={editItem}
            working={working}
            error={mutationError}
            onSave={async m => {
              if (await mutate("item", m, "Đã lưu món vào thực đơn.")) setEditItem(null);
            }}
          />
        </Modal>
      )}
      {canTables && deleteTable && (
        <Modal title={"Xóa " + deleteTable.name + "?"} onClose={() => !working && setDeleteTable(null)}>
          <div className="form-body">
            <p>Chỉ xóa bàn chưa có lượt phục vụ hoặc lịch sử liên quan. Mã QR của bàn sẽ ngừng sử dụng sau khi xóa.</p>
            {mutationError && (
              <p className="submission-error" role="alert">
                {mutationError}
              </p>
            )}
            <button
              type="button"
              className="danger-button"
              disabled={working}
              onClick={async () => {
                if (await mutate("table", { id: deleteTable.id, action: "delete" }, "Đã xóa bàn.")) setDeleteTable(null);
              }}
            >
              {working ? "Đang xóa…" : "Xác nhận xóa bàn"}
            </button>
            <button type="button" className="secondary" disabled={working} onClick={() => setDeleteTable(null)}>
              Giữ lại bàn
            </button>
          </div>
        </Modal>
      )}
      {canTables && editTable && (
        <Modal title={editTable.creationRequestId ? "Thêm bàn mới" : "Thông tin bàn"} onClose={() => !working && setEditTable(null)}>
          <form
            className="form-body"
            onSubmit={async e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  "table",
                  {
                    id: editTable.id,
                    name: f.get("name"),
                    zone: f.get("zone"),
                    ...(editTable.creationRequestId ? { create: true, requestId: editTable.creationRequestId } : {}),
                  },
                  editTable.creationRequestId ? "Đã thêm bàn mới và tạo mã QR riêng." : "Đã cập nhật bàn."
                )
              )
                setEditTable(null);
            }}
          >
            <label className="field">
              <span>Tên bàn</span>
              <input name="name" defaultValue={editTable.name} required maxLength={30} />
            </label>
            <label className="field">
              <span>Khu vực</span>
              <input name="zone" defaultValue={editTable.zone} required maxLength={40} />
            </label>
            {mutationError && (
              <p className="submission-error" role="alert">
                {mutationError}
              </p>
            )}
            <p className="table-form-note">
              {editTable.creationRequestId
                ? "Bàn mới sẽ ở trạng thái trống và có mã QR riêng để tải hoặc in."
                : "Mã QR hiện tại tiếp tục sử dụng sau khi đổi tên bàn."}
            </p>
            <button className="primary full" disabled={working}>
              {working ? "Đang lưu…" : editTable.creationRequestId ? "Thêm bàn & tạo mã QR" : "Lưu thông tin"}
            </button>
          </form>
        </Modal>
      )}
      {canCancel && cancelOrder && (
        <Modal title={"Hủy đơn #" + cancelOrder.code} onClose={() => !working && setCancelOrder(null)}>
          <form
            className="form-body"
            onSubmit={async e => {
              e.preventDefault();
              if (await mutate("order", { id: cancelOrder.id, status: "cancelled", reason }, "Đã hủy đơn và thông báo trạng thái cho khách.")) setCancelOrder(null);
            }}
          >
            <p>
              {cancelOrder.table_name} · {money(cancelOrder.total)}
            </p>
            <label className="field">
              <span>Lý do hủy (khách sẽ nhìn thấy)</span>
              <textarea
                required
                rows={3}
                maxLength={180}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ví dụ: Khách yêu cầu hủy món…"
              />
            </label>
            {mutationError && (
              <p className="submission-error" role="alert">
                {mutationError}
              </p>
            )}
            <button className="danger-button full" disabled={working || !reason.trim()}>
              Xác nhận hủy đơn
            </button>
          </form>
        </Modal>
      )}
      {canPay && confirmPaid && (
        <Modal title="Thanh toán lần gọi món" onClose={() => !working && setConfirmPaid(null)}>
          <div className="form-body">
            <p>
              Đơn <strong>#{confirmPaid.code}</strong> · {confirmPaid.table_name}
              {confirmPaid.customer_name && <> · {confirmPaid.customer_name}</>}
            </p>
            <h2>{money(confirmPaid.total)}</h2>
            <p>Chọn phương thức khách đã thanh toán. Chỉ xác nhận khi quán đã nhận đủ tiền.</p>
            <fieldset className="payment-method-picker">
              <legend>Phương thức thanh toán</legend>
              {(
                [
                  { id: "cash", label: "Tiền mặt", icon: Banknote },
                  { id: "bank", label: "Chuyển khoản", icon: Landmark },
                  { id: "other", label: "Khác", icon: WalletCards },
                ] as const
              ).map(method => (
                <label key={method.id} className={"payment-method-option " + (paymentMethod === method.id ? "selected" : "")}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    disabled={working}
                    onChange={() => setPaymentMethod(method.id)}
                  />
                  <method.icon size={20} />
                  <span>{method.label}</span>
                </label>
              ))}
            </fieldset>
            <p className="payment-timestamp-note">
              <Clock size={14} />
              Thời điểm thu tiền được ghi nhận khi xác nhận.
            </p>
            {mutationError && (
              <p className="submission-error" role="alert">
                {mutationError}
              </p>
            )}
            <button
              className="primary full"
              disabled={working || !paymentMethod}
              onClick={async () => {
                if (await mutate("order", { id: confirmPaid.id, action: "paid", paymentMethod }, "Đã ghi nhận tiền thu và phương thức thanh toán."))
                  setConfirmPaid(null);
              }}
            >
              {working ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
              Quán đã nhận đủ tiền
            </button>
          </div>
        </Modal>
      )}
    </AdminWorkspace>
  );
}

function ItemForm({
  initial,
  working,
  error = "",
  onSave,
}: {
  initial: Partial<MenuItem>;
  working: boolean;
  error?: string;
  onSave: (m: Partial<MenuItem>) => Promise<void>;
}) {
  const [image, setImage] = useState(initial.image || "/images/hero.webp"),
    [imageBusy, setImageBusy] = useState(false),
    [itemExtras, setItemExtras] = useState(() => (initial.id ? extrasFor(initial as MenuItem) : []));
  return (
    <form
      className="form-body"
      onSubmit={e => {
        e.preventDefault();
        if (imageBusy || working) return;
        const f = new FormData(e.currentTarget);
        void onSave({
          ...initial,
          name: String(f.get("name")),
          description: String(f.get("description")),
          category: f.get("category") as Category,
          price: Number(f.get("price")),
          promotion: undefined,
          extras: itemExtras,
          image,
          badge: String(f.get("badge")),
          available: f.get("available") === "on" ? 1 : 0,
        });
      }}
    >
      <label className="field">
        <span>Tên món</span>
        <input name="name" defaultValue={initial.name} required maxLength={80} />
      </label>
      <div className="form-two">
        <label className="field">
          <span>Nhóm món</span>
          <select name="category" defaultValue={initial.category}>
            {categories
              .filter(c => c.id !== "all")
              .map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Giá bán (VNĐ)</span>
          <input name="price" type="number" step={1000} min={1000} max={2000000} required defaultValue={initial.price} />
        </label>
      </div>
      <label className="field">
        <span>Mô tả ngắn</span>
        <textarea name="description" rows={3} maxLength={240} defaultValue={initial.description} />
      </label>
      <ItemExtrasEditor value={itemExtras} onChange={setItemExtras} disabled={working} />
      <DishImageField value={image} disabled={working || imageBusy} onChange={setImage} onBusy={setImageBusy} />
      <label className="field">
        <span>Nhãn gợi ý</span>
        <input name="badge" maxLength={32} defaultValue={initial.badge} placeholder="Ví dụ: Món mới" />
      </label>
      <label className="option-row">
        <input name="available" type="checkbox" defaultChecked={!!initial.available} />
        <span>Sẵn sàng phục vụ</span>
      </label>
      {error && (
        <p className="submission-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={working || imageBusy}>
        {working ? <LoaderCircle className="spin" size={16} /> : <Check size={17} />}Lưu món
      </button>
    </form>
  );
}

function ShopForm({ shop, working, onSave }: { shop: Shop; working: boolean; onSave: (s: Shop) => Promise<boolean> }) {
  const [logo, setLogo] = useState(shop.logo ?? ""),
    [logoBusy, setLogoBusy] = useState(false);
  return (
    <div className="settings-layout">
      <form
        className="settings-form"
        onSubmit={e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (logoBusy || working) return;
          void onSave({
            logo,
            name: String(f.get("name")),
            tagline: String(f.get("tagline")),
            hours: String(f.get("hours")),
            address: String(f.get("address")),
            open: f.get("open") === "on",
          });
        }}
      >
        <h2>Thông tin cửa hàng</h2>
        <ShopLogoField value={logo} name={shop.name} disabled={working} onChange={setLogo} onBusy={setLogoBusy} />
        <p>Cá nhân hóa thực đơn bằng tên và thông tin của quán.</p>
        <label className="field">
          <span>Tên cửa hàng</span>
          <input name="name" required maxLength={40} defaultValue={shop.name} />
        </label>
        <label className="field">
          <span>Dòng giới thiệu dưới tên</span>
          <input name="tagline" maxLength={60} defaultValue={shop.tagline} />
        </label>
        <label className="field">
          <span>Giờ phục vụ</span>
          <input name="hours" maxLength={50} defaultValue={shop.hours} />
        </label>
        <label className="field">
          <span>Địa chỉ hoặc lời giới thiệu ngắn</span>
          <textarea name="address" maxLength={140} rows={3} defaultValue={shop.address} />
        </label>
        <label className="shop-open">
          <input type="checkbox" name="open" defaultChecked={shop.open} />
          <span>
            <strong>Đang nhận món</strong>
            <small>Tắt khi quán nghỉ hoặc bếp cần tạm dừng.</small>
          </span>
        </label>
        <button className="primary" disabled={working || logoBusy}>
          <Check size={17} />
          Lưu thay đổi
        </button>
      </form>
      <aside className="settings-guide">
        <Leaf size={32} />
        <h2>
          Sẵn sàng đón khách
          <br />
          trong vài bước.
        </h2>
        <ol>
          <li>Cập nhật tên cửa hàng.</li>
          <li>Thêm món, giá và ảnh thật.</li>
          <li>Đặt tên bàn và tải mã QR.</li>
          <li>Quét QR, nhập tên và duyệt mở bàn.</li>
          <li>Thử gọi món, thanh toán và đóng bàn.</li>
        </ol>
        <p>Quản lý đơn bằng tài khoản đã được cấp quyền. Thanh toán hiện được xác nhận thủ công tại quán.</p>
      </aside>
    </div>
  );
}

function promotionDate(value: number | null | undefined) {
  return value ? new Date(value + 7 * 3600000).toISOString().slice(0, 16) : "";
}

function PromotionFields({ initial }: { initial?: Promotion | null }) {
  const [enabled, setEnabled] = useState(!!initial?.enabled),
    [type, setType] = useState<Promotion["type"]>(initial?.type ?? "percent");
  return (
    <fieldset className="promotion-fields">
      <legend>Khuyến mại món</legend>
      <label className="option-row">
        <input name="promotionEnabled" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span>Bật giảm giá cho món này</span>
      </label>
      <p>Giảm trên giá món, không giảm phụ thu. Đơn đã đặt giữ nguyên giá.</p>
      {enabled && (
        <>
          <div className="form-two">
            <label className="field">
              <span>Hình thức giảm</span>
              <select name="promotionType" value={type} onChange={e => setType(e.target.value as Promotion["type"])}>
                <option value="percent">Theo phần trăm (%)</option>
                <option value="amount">Theo số tiền (₫)</option>
              </select>
            </label>
            <label className="field">
              <span>{type === "percent" ? "Mức giảm (%)" : "Số tiền giảm (₫)"}</span>
              <input
                key={type}
                name="promotionValue"
                type="number"
                min={1}
                max={type === "percent" ? 99 : 1999000}
                step={1}
                required
                defaultValue={initial?.type === type ? initial.value : type === "percent" ? 10 : 5000}
              />
            </label>
          </div>
          <div className="form-two">
            <label className="field">
              <span>Bắt đầu (giờ Việt Nam)</span>
              <input name="promotionStart" type="datetime-local" defaultValue={promotionDate(initial?.startsAt)} />
            </label>
            <label className="field">
              <span>Kết thúc (giờ Việt Nam)</span>
              <input name="promotionEnd" type="datetime-local" defaultValue={promotionDate(initial?.endsAt)} />
            </label>
          </div>
          <small>Để trống ngày bắt đầu để áp dụng ngay; để trống ngày kết thúc để chạy đến khi tắt. Giá sau giảm tối thiểu 1.000 ₫.</small>
        </>
      )}
    </fieldset>
  );
}

function readPromotionForm(f: FormData, initial: Promotion | null | undefined): Promotion | null {
  return f.get("promotionEnabled") === "on"
    ? {
        enabled: true,
        type: f.get("promotionType") as Promotion["type"],
        value: Number(f.get("promotionValue")),
        startsAt: f.get("promotionStart") ? Date.parse(String(f.get("promotionStart")) + ":00+07:00") : null,
        endsAt: f.get("promotionEnd") ? Date.parse(String(f.get("promotionEnd")) + ":00+07:00") : null,
      }
    : initial
    ? { ...initial, enabled: false }
    : null;
}
