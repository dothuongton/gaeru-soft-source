"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, LoaderCircle, AlertTriangle, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  let id = localStorage.getItem("gaeru:device-id");
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    id = "dev-" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    localStorage.setItem("gaeru:device-id", id);
  }
  return id;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Service Worker không phản hồi kịp thời")), ms)
    ),
  ]);
};

type PushState = "checking" | "unsupported" | "server_disabled" | "denied" | "ready" | "subscribed";

export function AdminPushToggle({notify,iconOnly=false}:{notify:(msg:string)=>void;iconOnly?:boolean}){
 return <span className={iconOnly?"aw-push-control":""}><PushControl notify={notify}/></span>;
}
function PushControl({ notify }: { notify: (msg: string) => void }) {
  const [state, setState] = useState<PushState>("checking");
  const [loading, setLoading] = useState(false);
  const [testTesting, setTestTesting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      // Async boundary prevents synchronous setState inside effect
      await Promise.resolve();
      if (cancelled) return;

      if (typeof window === "undefined") return;

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const config = await api<{ enabled: boolean; vapidPublicKey: string | null }>("admin/push/config");
        if (cancelled) return;

        if (!config.enabled || !config.vapidPublicKey) {
          setState("server_disabled");
          return;
        }
        setVapidKey(config.vapidPublicKey);

        const deviceId = getOrCreateDeviceId();
        const status = await api<{ subscribed: boolean }>(`admin/push/status?deviceId=${encodeURIComponent(deviceId)}`);
        if (cancelled) return;

        const reg = await withTimeout(navigator.serviceWorker.ready, 4000);
        const existingSub = await reg.pushManager.getSubscription();
        if (cancelled) return;

        if (status.subscribed && existingSub) {
          setState("subscribed");
        } else {
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("ready");
      }
    };

    void checkStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubscribe = async () => {
    if (loading || !vapidKey) return;
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

      await api("admin/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
          },
        }),
      });

      setState("subscribed");
      notify("Đã bật thông báo đẩy trên thiết bị này.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notify("Thiết bị này đã gắn với tài khoản khác. Vui lòng đăng xuất tài khoản cũ.");
      } else {
        notify((err as Error).message || "Không thể kích hoạt thông báo đẩy.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (loading) return;
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

      await api("admin/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ deviceId, endpoint }),
      });

      // NOTE: We do NOT call sub.unsubscribe() so other store subscriptions remain intact
      setState("ready");
      setMenuOpen(false);
      notify("Đã tắt thông báo đẩy cho cửa hàng này trên máy.");
    } catch (err) {
      notify((err as Error).message || "Chưa tắt được thông báo. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleTestPush = async () => {
    if (testTesting) return;
    setTestTesting(true);

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await api<{ success: boolean; delivered: number; error?: string }>("admin/push/test", {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });

      if (res.success) {
        notify("Đã gửi thông báo thử nghiệm thành công!");
      } else {
        notify(res.error || "Gửi thử nghiệm không thành công.");
      }
    } catch (err) {
      notify((err as Error).message || "Lỗi khi gửi thông báo thử nghiệm.");
    } finally {
      setTestTesting(false);
    }
  };

  if (state === "checking") {
    return (
      <button type="button" disabled className="secondary icon-label opacity-70 cursor-wait">
        <LoaderCircle size={17} className="animate-spin text-slate-500" />
        <span>Đang kiểm tra push…</span>
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
        <BellOff size={17} />
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
        <BellOff size={17} />
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
          <BellRing size={17} className="text-emerald-700 animate-pulse" />
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
              <BellOff size={15} />
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
      {loading ? <LoaderCircle size={17} className="animate-spin text-emerald-600" /> : <Bell size={17} />}
      <span>Bật thông báo đẩy</span>
    </button>
  );
}
