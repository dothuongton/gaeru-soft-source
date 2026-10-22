/* eslint-disable no-restricted-globals */
// GAERU Soft Service Worker — PWA, offline fallback & Staff Web Push

const CACHE_NAME = "gaeru-static-v2";
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
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gaeru-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
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

  // 1. Navigation requests (HTML documents) — ALL HTML navigations get offline fallback
  // Includes root, store paths, and table QR URLs (?table=... / ?session=...).
  // Network-first: always fetch fresh from server; if offline, return neutral offline.html.
  // CRITICAL: Never cache dynamic table/session HTML to prevent leaking customer order states.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match(OFFLINE_URL);
        return (
          cachedOffline ||
          new Response("Mất kết nối mạng. Vui lòng thử lại sau.", {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  // 2. Strictly NETWORK-ONLY for APIs, Flight/RSC, dynamic query states
  // Do NOT return offline.html for data/APIs.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    request.headers.get("Next-Url")
  ) {
    return;
  }

  // 3. Static immutable assets: Vite/Next hashed bundles and identity icons
  const isPrecached = PRECACHE_ASSETS.includes(url.pathname);
  const isHashedAsset =
    url.pathname.startsWith("/_next/static/") ||
    (url.pathname.startsWith("/assets/") && /[-.][a-f0-9]{8,}\./i.test(url.pathname));

  if (isPrecached || isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Other static images/media: network-first with cache fallback, NEVER return HTML on fail
  if (url.pathname.startsWith("/images/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(null, { status: 504, statusText: "Gateway Timeout (Offline)" });
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

  event.waitUntil(
    (async () => {
      const data = event.notification.data || {};
      const rawUrl = data.url || "/?view=admin";
      const storeId = data.storeId;

      let targetUrl;
      try {
        const parsed = new URL(rawUrl, self.location.origin);
        // Strict same-origin validation: must be exact same origin and http/https protocol
        if (
          parsed.origin !== self.location.origin ||
          (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        ) {
          targetUrl = new URL("/?view=admin", self.location.origin);
        } else {
          targetUrl = parsed;
        }
      } catch {
        targetUrl = new URL("/?view=admin", self.location.origin);
      }

      // Preserve storeId if specified and not main
      if (storeId && storeId !== "main" && !targetUrl.searchParams.has("store")) {
        targetUrl.searchParams.set("store", storeId);
      }

      const targetHref = targetUrl.href;

      // Find all existing browser windows
      const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          // Only reuse an existing window if it is an admin window for the exact same store!
          // NEVER hijack a customer ordering / draft tab!
          if (
            clientUrl.origin === self.location.origin &&
            clientUrl.searchParams.get("view") === "admin"
          ) {
            const clientStore = clientUrl.searchParams.get("store") || "main";
            const targetStore = targetUrl.searchParams.get("store") || "main";
            if (clientStore === targetStore && "focus" in client) {
              await client.navigate(targetHref);
              return client.focus();
            }
          }
        } catch {
          // ignore parsing error
        }
      }

      // If no suitable admin window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetHref);
      }
    })()
  );
});
