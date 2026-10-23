export type SoundMode = "voice" | "chime" | "silent";
export type StaffNotificationPreferences = {soundMode: SoundMode; voice: string};
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** Browser permissions and audio activation are deliberately never persisted here. */
export function staffNotificationKey(storeId: string, userId: string | null): string | null {
  return userId ? "gaeru:staff-notifications:v1:" + JSON.stringify([storeId, userId]) : null;
}

export function readNotificationPreferences(storage: PreferenceStorage | null, key: string | null): StaffNotificationPreferences {
  const defaults: StaffNotificationPreferences = {soundMode: "voice", voice: ""};
  if (!storage || !key) return defaults;
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    if (!value || !["voice", "chime", "silent"].includes(value.soundMode)) return defaults;
    return {soundMode: value.soundMode, voice: typeof value.voice === "string" ? value.voice.slice(0, 512) : ""};
  } catch {return defaults;}
}

export function saveNotificationPreferences(storage: PreferenceStorage | null, key: string | null, value: StaffNotificationPreferences): void {
  if (!storage || !key) return;
  try {storage.setItem(key, JSON.stringify(value));} catch { /* Keep the active session usable. */ }
}

export function notificationStorage(): PreferenceStorage | null {
  try {return window.localStorage;} catch {return null;}
}
