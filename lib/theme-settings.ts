export type ThemeSettings = {
  accentColor: string;
  textColor: string;
};

export const DEFAULT_THEME_SETTINGS: Readonly<ThemeSettings> = {
  accentColor: "#244f3c",
  textColor: "#27382e",
};

export const THEME_PRESETS: ReadonlyArray<{name: string; settings: ThemeSettings}> = [
  {name: "Xanh lá", settings: {...DEFAULT_THEME_SETTINGS}},
  {name: "Xanh dương", settings: {accentColor: "#1f4f93", textColor: "#263449"}},
  {name: "Nâu đất", settings: {accentColor: "#995035", textColor: "#3f3028"}},
  {name: "Tím", settings: {accentColor: "#65428f", textColor: "#352d43"}},
];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

export function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ThemeSettings>;
  return isHexColor(candidate.accentColor) && isHexColor(candidate.textColor);
}

/** Only accepted hex colors reach style variables or shared configuration. */
export function normalizeThemeSettings(value: unknown): ThemeSettings {
  if (!isThemeSettings(value)) return {...DEFAULT_THEME_SETTINGS};
  return {accentColor: value.accentColor.toLowerCase(), textColor: value.textColor.toLowerCase()};
}

function luminance(color: string): number {
  const safe = isHexColor(color) ? color : DEFAULT_THEME_SETTINGS.accentColor;
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(safe.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(colorA: string, colorB: string): number {
  const a = luminance(colorA), b = luminance(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Select the more readable neutral for a button filled with the accent. */
export function readableForeground(color: string): "#ffffff" | "#000000" {
  return contrastRatio(color, "#ffffff") >= contrastRatio(color, "#000000") ? "#ffffff" : "#000000";
}

/** Keep brand text readable on a light surface without changing button fills. */
export function accentTextColor(accentColor: string): string {
  const color = isHexColor(accentColor) ? accentColor.toLowerCase() : DEFAULT_THEME_SETTINGS.accentColor;
  if (contrastRatio(color, "#ffffff") >= 4.5) return color;
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const shade = (fraction: number) => "#" + channels.map(channel => Math.round(channel * fraction).toString(16).padStart(2, "0")).join("");
  let passing = 0, failing = 1, result = "#000000";
  // Search the closest darker shade. Test the rounded output so the final hex
  // still meets the threshold after converting back to eight-bit channels.
  for (let step = 0; step < 18; step++) {
    const fraction = (passing + failing) / 2;
    const candidate = shade(fraction);
    if (contrastRatio(candidate, "#ffffff") >= 4.5) {
      passing = fraction; result = candidate;
    } else failing = fraction;
  }
  return result;
}
