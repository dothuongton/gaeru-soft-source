import { env } from "cloudflare:workers";
import { buildPushPayload, type PushMessage } from "@block65/webcrypto-web-push";
import { OrderError } from "./menu";
import { storeDatabase, inStore } from "./store-database";
import { database } from "./server";
import { ownerEmails } from "./staff-access";
import { hasPermission, normalizePermissions, type Permission } from "./staff-permissions";
import { waitUntil } from "./worker-context";

export const ALLOWED_PUSH_HOST_PATTERNS = [
  /^fcm\.googleapis\.com$/,
  /^[a-z0-9.-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,
  /^[a-z0-9.-]+\.push\.services\.mozilla\.com$/,
];

export function isValidPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;

    const hostname = url.hostname.toLowerCase();
    // Reject numeric IP addresses (IPv4 and IPv6) and localhost
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":") || hostname === "localhost") {
      return false;
    }
    return ALLOWED_PUSH_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

export function getVapidConfig(): {
  enabled: boolean;
  publicKey?: string;
  privateKey?: string;
  subject?: string;
} {
  const publicKey = env.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT || process.env.VAPID_SUBJECT || "mailto:support@gaeru.com";

  if (publicKey && privateKey) {
    return { enabled: true, publicKey, privateKey, subject };
  }
  return { enabled: false };
}

export async function hashEndpoint(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PushSubscriptionRow {
  store_id: string;
  id: string;
  user_id: string;
  staff_account_id: string | null;
  device_id: string;
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
}

export async function subscribeStaffDevice(params: {
  userId: string;
  staffAccountId?: string | null;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const { userId, staffAccountId, deviceId, endpoint, p256dh, auth } = params;

  if (!userId || typeof userId !== "string") throw new OrderError("Danh tính nhân viên không hợp lệ.", 400);
  if (!deviceId || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
    throw new OrderError("Mã thiết bị không hợp lệ.", 400);
  }
  if (!isValidPushEndpoint(endpoint)) {
    throw new OrderError("Dịch vụ thông báo (Push Service) không thuộc danh sách hỗ trợ hoặc không an toàn.", 400);
  }
  if (!p256dh || typeof p256dh !== "string" || p256dh.length < 40 || p256dh.length > 180) {
    throw new OrderError("Khóa p256dh không hợp lệ.", 400);
  }
  if (!auth || typeof auth !== "string" || auth.length < 16 || auth.length > 64) {
    throw new OrderError("Khóa auth không hợp lệ.", 400);
  }

  const endpointHash = await hashEndpoint(endpoint);
  const now = Date.now();
  const db = storeDatabase();

  // Check if an existing row matches this endpoint hash or (userId, deviceId)
  const existing = await db
    .prepare("SELECT * FROM staff_push_subscriptions WHERE endpoint_hash = ? OR (user_id = ? AND device_id = ?)")
    .bind(endpointHash, userId, deviceId)
    .first<PushSubscriptionRow>();

  if (existing) {
    await db
      .prepare(
        "UPDATE staff_push_subscriptions SET user_id = ?, staff_account_id = ?, device_id = ?, endpoint = ?, endpoint_hash = ?, p256dh = ?, auth = ?, updated_at = ?, last_seen_at = ? WHERE id = ?"
      )
      .bind(
        userId,
        staffAccountId ?? null,
        deviceId,
        endpoint,
        endpointHash,
        p256dh,
        auth,
        now,
        now,
        existing.id
      )
      .run();
  } else {
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO staff_push_subscriptions (id, user_id, staff_account_id, device_id, endpoint, endpoint_hash, p256dh, auth, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        userId,
        staffAccountId ?? null,
        deviceId,
        endpoint,
        endpointHash,
        p256dh,
        auth,
        now,
        now,
        now
      )
      .run();
  }
}

export async function unsubscribeStaffDevice(params: {
  userId: string;
  deviceId?: string;
  endpoint?: string;
}): Promise<void> {
  const { userId, deviceId, endpoint } = params;
  const db = storeDatabase();

  if (deviceId) {
    await db
      .prepare("DELETE FROM staff_push_subscriptions WHERE user_id = ? AND device_id = ?")
      .bind(userId, deviceId)
      .run();
  } else if (endpoint) {
    const endpointHash = await hashEndpoint(endpoint);
    await db
      .prepare("DELETE FROM staff_push_subscriptions WHERE user_id = ? AND endpoint_hash = ?")
      .bind(userId, endpointHash)
      .run();
  }
}

export async function getStaffSubscriptionStatus(params: {
  userId: string;
  deviceId: string;
}): Promise<{ subscribed: boolean }> {
  const { userId, deviceId } = params;
  const db = storeDatabase();
  const row = await db
    .prepare("SELECT id FROM staff_push_subscriptions WHERE user_id = ? AND device_id = ?")
    .bind(userId, deviceId)
    .first<{ id: string }>();

  return { subscribed: !!row };
}

export async function dispatchStaffPush(params: {
  storeId: string;
  requiredPermission: Permission;
  eventType: string;
  eventTag: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  const config = getVapidConfig();
  if (!config.enabled || !config.publicKey || !config.privateKey) {
    return;
  }

  const { storeId, requiredPermission, eventType, eventTag, title, body, url } = params;

  // Run in background via waitUntil
  const task = inStore(storeId, async () => {
    try {
      const db = storeDatabase();
      const rootDb = database();

        // 1. Get all subscriptions in this store
        const subs = await db
          .prepare("SELECT * FROM staff_push_subscriptions")
          .all<PushSubscriptionRow>();

        if (!subs.results || subs.results.length === 0) return;

        // 2. Filter subscriptions where the user is an active employee with requiredPermission or an owner
        const protectedOwners = new Set(ownerEmails());
        const eligibleSubs: PushSubscriptionRow[] = [];

        for (const sub of subs.results) {
          // Check if owner
          const ownerBinding = await rootDb
            .prepare("SELECT email FROM staff_owner_bindings WHERE user_id = ?")
            .bind(sub.user_id)
            .first<{ email: string }>();

          if (ownerBinding && protectedOwners.has(ownerBinding.email)) {
            eligibleSubs.push(sub);
            continue;
          }

          // Check if staff account in this store
          const account = await db
            .prepare("SELECT * FROM staff_accounts WHERE user_id = ? AND status = 'active'")
            .bind(sub.user_id)
            .first<{ permissions_json: string }>();

          if (account) {
            let perms: Permission[] = [];
            try {
              perms = normalizePermissions(JSON.parse(account.permissions_json));
            } catch {
              perms = [];
            }
            if (hasPermission({ isStaff: true, permissions: perms }, requiredPermission)) {
              eligibleSubs.push(sub);
            }
          }
        }

        if (eligibleSubs.length === 0) return;

        const messageData: PushMessage = {
          data: JSON.stringify({
            type: eventType,
            tag: eventTag,
            title,
            body,
            url: url || "/?view=admin",
            storeId,
          }),
          options: {
            ttl: 300,
            topic: eventType,
            urgency: "high",
          },
        };

        const staleIds: string[] = [];

        await Promise.all(
          eligibleSubs.map(async (sub) => {
            try {
              if (!isValidPushEndpoint(sub.endpoint)) {
                staleIds.push(sub.id);
                return;
              }

              const payload = await buildPushPayload(
                messageData,
                {
                  endpoint: sub.endpoint,
                  expirationTime: null,
                  keys: {
                    auth: sub.auth,
                    p256dh: sub.p256dh,
                  },
                },
                {
                  subject: config.subject,
                  publicKey: config.publicKey,
                  privateKey: config.privateKey,
                }
              );

              const response = await fetch(sub.endpoint, {
                method: "POST",
                headers: payload.headers,
                body: payload.body,
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              });

              if (response.status === 404 || response.status === 410) {
                // Subscription is dead / unsubscribed on push service
                staleIds.push(sub.id);
              }
            } catch (err) {
              console.warn("Push send error for endpoint:", err instanceof Error ? err.message : err);
            }
          })
        );

        if (staleIds.length > 0) {
          for (const id of staleIds) {
            await db.prepare("DELETE FROM staff_push_subscriptions WHERE id = ?").bind(id).run();
          }
        }
    } catch (err) {
      console.error("dispatchStaffPush error:", err);
    }
  });
  waitUntil(task);
  return task;
}

export async function sendTestPush(params: {
  userId: string;
  deviceId: string;
  storeId: string;
}): Promise<{ success: boolean; delivered: number; error?: string }> {
  const config = getVapidConfig();
  if (!config.enabled || !config.publicKey || !config.privateKey) {
    return { success: false, delivered: 0, error: "Hệ thống chưa cấu hình VAPID keys cho Web Push." };
  }

  const { userId, deviceId, storeId } = params;
  const db = storeDatabase();

  const subs = await db
    .prepare("SELECT * FROM staff_push_subscriptions WHERE user_id = ? AND device_id = ?")
    .bind(userId, deviceId)
    .all<PushSubscriptionRow>();

  if (!subs.results || subs.results.length === 0) {
    return { success: false, delivered: 0, error: "Thiết bị này chưa đăng ký nhận thông báo đẩy." };
  }

  const messageData: PushMessage = {
    data: JSON.stringify({
      type: "test",
      tag: `test:${deviceId}:${Date.now()}`,
      title: "GAERU Soft — Thử thông báo",
      body: "Thông báo đẩy đang hoạt động tốt trên thiết bị của bạn.",
      url: "/?view=admin",
      storeId,
    }),
    options: {
      ttl: 60,
      topic: "test",
      urgency: "high",
    },
  };

  let delivered = 0;
  for (const sub of subs.results) {
    try {
      const payload = await buildPushPayload(
        messageData,
        {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh,
          },
        },
        {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        }
      );

      const response = await fetch(sub.endpoint, {
        method: "POST",
        headers: payload.headers,
        body: payload.body,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok || response.status === 201) {
        delivered++;
      }
    } catch (err) {
      console.warn("Test push error:", err);
    }
  }

  return { success: delivered > 0, delivered };
}
