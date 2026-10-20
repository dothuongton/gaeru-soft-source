import { database } from "./server";
import { OrderError } from "./menu";
import { isDisplaySettings, normalizeDisplaySettings } from "./display-settings";
import type { DisplaySettings } from "./display-settings";

const settingsKey = "display-settings";

/** Old installations have no display settings row; reads never alter settings. */
export async function getDisplaySettings(): Promise<DisplaySettings> {
  const saved = await database().prepare("SELECT value FROM settings WHERE key = ?")
    .bind(settingsKey).first<{ value: string }>();
  let value: unknown;
  try {
    value = saved ? JSON.parse(saved.value) : undefined;
  } catch {
    value = undefined;
  }
  return normalizeDisplaySettings(value);
}

export async function saveDisplaySettings(value: unknown): Promise<{ ok: true; displaySettings: DisplaySettings }> {
  if (!isDisplaySettings(value)) {
    throw new OrderError("Vui lòng chọn thời gian popup từ 1–30 giây, cỡ chữ và ảnh món từ 100–250%. Các giá trị phải là số nguyên.");
  }
  // Persist exactly the three supported fields as a single value. This keeps a
  // failed/concurrent save from mixing settings and never touches shop details.
  const displaySettings = normalizeDisplaySettings(value);
  await database().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(settingsKey, JSON.stringify(displaySettings)).run();
  return { ok: true, displaySettings };
}
