"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

export function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;

    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setShowUpdate(true);
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        });
      })
      .catch((err) => {
        // Silently tolerate registration failure (e.g. unsupported origins or private mode)
        console.debug("Service Worker registration skipped/failed:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  };

  if (!showUpdate) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md rounded-xl border border-emerald-800 bg-[#1e4635] p-3.5 text-white shadow-2xl transition-all sm:bottom-6 sm:right-6 sm:left-auto"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <RefreshCw className="h-5 w-5 shrink-0 text-emerald-300" />
          <div className="text-sm">
            <p className="font-semibold leading-tight">Đã có bản cập nhật mới</p>
            <p className="text-xs text-emerald-200/90 leading-tight mt-0.5">
              Tải lại để nhận tính năng và sửa lỗi mới nhất.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUpdate}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-[#1e4635]"
          >
            Tải lại
          </button>
          <button
            type="button"
            onClick={() => setShowUpdate(false)}
            aria-label="Đóng thông báo"
            className="rounded-lg p-1 text-emerald-200/80 hover:bg-emerald-900/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
