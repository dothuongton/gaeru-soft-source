"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

let localUserConsented = false;

export function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;

    const handleControllerChange = () => {
      // CRITICAL: Only reload if the user in THIS tab explicitly consented to update.
      // A background update from another tab or first SW install must NEVER forcefully reload an active tab!
      if (localUserConsented && !refreshing) {
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
      localUserConsented = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <aside
      className="pwa-update-banner"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        backgroundColor: "#064e3b",
        color: "#f0fdf4",
        padding: "0.75rem 1.25rem",
        borderRadius: "9999px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        fontSize: "0.875rem",
        fontWeight: 500,
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      <span>Có phiên bản mới của ứng dụng</span>
      <button
        type="button"
        onClick={handleUpdate}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          backgroundColor: "#10b981",
          color: "#ffffff",
          border: "none",
          padding: "0.375rem 0.75rem",
          borderRadius: "9999px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.8125rem",
        }}
      >
        <RefreshCw size={14} />
        Tải lại
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Đóng thông báo"
        style={{
          background: "transparent",
          border: "none",
          color: "#a7f3d0",
          cursor: "pointer",
          display: "inline-flex",
          padding: "0.25rem",
        }}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
