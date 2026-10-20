import {popupDurationMs} from "./display-settings";

export type PopupTiming = {alertId: string; durationMs: number};

/** A setting change affects the next popup; polling or a table move keeps this one stable. */
export function resolvePopupTiming(previous: PopupTiming | null, alertId: string, seconds: number): PopupTiming {
  return previous?.alertId === alertId ? previous : {alertId, durationMs: popupDurationMs(seconds)};
}
