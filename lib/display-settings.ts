export type DisplaySettings = {
  popupSeconds: number;
  fontPercent: number;
  foodImagePercent: number;
};

export const DEFAULT_DISPLAY_SETTINGS: Readonly<DisplaySettings> = {
  popupSeconds: 3,
  fontPercent: 200,
  foodImagePercent: 200,
};

export const POPUP_SECONDS_MIN = 1;
export const POPUP_SECONDS_MAX = 30;
export const DISPLAY_PERCENT_MIN = 100;
export const DISPLAY_PERCENT_MAX = 250;

export function isDisplaySettings(value: unknown): value is DisplaySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DisplaySettings>;
  const within = (entry: unknown, min: number, max: number): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= min && entry <= max;
  return within(candidate.popupSeconds, POPUP_SECONDS_MIN, POPUP_SECONDS_MAX) && within(candidate.fontPercent, DISPLAY_PERCENT_MIN, DISPLAY_PERCENT_MAX) && within(candidate.foodImagePercent, DISPLAY_PERCENT_MIN, DISPLAY_PERCENT_MAX);
}

export function normalizeDisplaySettings(value: unknown): DisplaySettings {
  if (!isDisplaySettings(value)) return {...DEFAULT_DISPLAY_SETTINGS};
  return {popupSeconds: value.popupSeconds, fontPercent: value.fontPercent, foodImagePercent: value.foodImagePercent};
}

/** Existing styles are already doubled; 200% keeps their current dimensions. */
export function displayScale(percent: number): number {
  return Number.isInteger(percent) && percent >= DISPLAY_PERCENT_MIN && percent <= DISPLAY_PERCENT_MAX ? percent / 200 : 1;
}

export function popupDurationMs(seconds: number): number {
  return Number.isInteger(seconds) && seconds >= POPUP_SECONDS_MIN && seconds <= POPUP_SECONDS_MAX ? seconds * 1_000 : DEFAULT_DISPLAY_SETTINGS.popupSeconds * 1_000;
}
