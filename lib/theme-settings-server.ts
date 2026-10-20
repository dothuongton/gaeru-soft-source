import {database} from "./server";
import {OrderError} from "./menu";
import {isThemeSettings, normalizeThemeSettings} from "./theme-settings";
import type {ThemeSettings} from "./theme-settings";

const settingsKey = "theme-settings";

export async function getThemeSettings(): Promise<ThemeSettings> {
  const saved = await database().prepare("SELECT value FROM settings WHERE key = ?")
    .bind(settingsKey).first<{value: string}>();
  let value: unknown;
  try {
    value = saved ? JSON.parse(saved.value) : undefined;
  } catch {
    value = undefined;
  }
  return normalizeThemeSettings(value);
}

export async function saveThemeSettings(value: unknown): Promise<{ok: true; themeSettings: ThemeSettings}> {
  if (!isThemeSettings(value)) throw new OrderError("Vui lòng nhập đủ màu giao diện và màu chữ theo dạng #RRGGBB, ví dụ #244f3c.");
  const themeSettings = normalizeThemeSettings(value);
  // One projected value prevents mixed fields during competing writes and
  // leaves display settings, shop details and ordering state untouched.
  await database().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(settingsKey, JSON.stringify(themeSettings)).run();
  return {ok: true, themeSettings};
}
