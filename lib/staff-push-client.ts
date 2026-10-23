import type {PreferenceStorage} from "./staff-notification-preferences";

export type PushState = "checking" | "unsupported" | "server_disabled" | "denied" | "ready" | "subscribed" | "key_changed" | "check_error";
export type PushStatus = {enabled: boolean; vapidPublicKey: string | null; subscribed: boolean};
type Subscription = {options: {applicationServerKey: ArrayBuffer | null}};

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

export function matchesApplicationKey(subscription: Subscription, key: string): boolean {
  const saved = subscription.options.applicationServerKey;
  if (!saved) return false;
  const expected = urlBase64ToUint8Array(key), bytes = new Uint8Array(saved);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

export async function withPushTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Chưa kiểm tra được thông báo đẩy. Vui lòng thử lại.")), ms);
    })]);
  } finally {clearTimeout(timer);}
}

/** Server and browser checks start together. Passive checks never wait for SW installation. */
export async function checkStaffPush(
  remote: () => Promise<PushStatus>,
  local: () => Promise<Subscription | null>,
  permission: NotificationPermission,
): Promise<{state: PushState; vapidKey: string | null}> {
  const [config, subscription] = await Promise.all([remote(), local()]);
  if (!config.enabled || !config.vapidPublicKey) return {state: "server_disabled", vapidKey: null};
  const vapidKey = config.vapidPublicKey;
  if (permission === "denied") return {state: "denied", vapidKey};
  if (subscription && !matchesApplicationKey(subscription, vapidKey)) return {state: "key_changed", vapidKey};
  return {state: permission === "granted" && config.subscribed && subscription ? "subscribed" : "ready", vapidKey};
}

// A snapshot is a display hint, never proof of permission/subscription or authority to send.
export function readPushHint(storage: PreferenceStorage | null, scope: string | null): "subscribed" | "ready" | null {
  if (!storage || !scope) return null;
  try {
    const saved = JSON.parse(storage.getItem(scope + ":push") || "null");
    return saved === "subscribed" || saved === "ready" ? saved : null;
  } catch {return null;}
}

export function savePushHint(storage: PreferenceStorage | null, scope: string | null, state: PushState): void {
  if (!storage || !scope) return;
  try {storage.setItem(scope + ":push", JSON.stringify(state === "subscribed" ? "subscribed" : "ready"));} catch { /* Optional display hint. */ }
}
