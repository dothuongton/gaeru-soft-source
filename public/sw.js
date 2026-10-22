/* eslint-disable no-restricted-globals */
// GAERU Soft Service Worker — PWA, offline fallback & Staff Web Push

const CACHE_NAME = "gaeru-static-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/favicon.svg",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

// Install: precache offline fallback and essential static identity assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

// Activate: clean up older gaeru caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("gaeru-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Listen for message from client (e.g. user accepted update banner)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: Strict network-first for dynamic content, cache for immutable assets, offline.html fallback for navigation
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Cross-origin: let browser handle normally
  if (url.origin !== self.location.origin) {
    return;
  }

  // Strictly NETWORK-ONLY for APIs, auth, Flight/RSC, QR parameters, and dynamic admin queries
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.searchParams.has("table") ||
    url.searchParams.has("session") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    request.headers.get("Next-Url")
  ) {
    return;
  }

  // Navigation requests (HTML documents)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match(OFFLINE_URL);
        return (
          cachedOffline ||
          new Response("Mất kết nối mạng. Vui lòng thử lại sau.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  // Static immutable assets: Vite dist assets, public images, icons
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/images/") ||
    PRECACHE_ASSETS.includes(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(OFFLINE_URL));
      })
    );
  }
});

// Push notification handling
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title || "GAERU Soft";
  const options = {
    body: payload.body || "Bạn có thông báo mới.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "gaeru-alert",
    data: {
      url: payload.url || "/?view=admin",
      storeId: payload.storeId || "main",
      type: payload.type || "generic",
    },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: Focus or navigate to the relevant admin/store view
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath = event.notification.data?.url || "/?view=admin";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.navigate(targetUrl).then((c) => c?.focus?.());
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
