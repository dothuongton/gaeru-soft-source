export type PollerState = "idle" | "polling" | "backoff" | "paused" | "stopped";

export type PollerStatus = {
  state: PollerState;
  attempt: number;
  nextDelayMs: number;
  isOffline: boolean;
};

export type AdaptiveSchedulerConfig = {
  /** The async task to run on each poll tick */
  task: () => Promise<boolean | void>;
  /** Base interval in ms when active and healthy */
  baseIntervalMs: number;
  /** Maximum backoff interval in ms when errors occur (default 30_000) */
  maxIntervalMs?: number;
  /** Jitter ratio (0 to 1, default 0.25) to prevent thundering herds */
  jitterRatio?: number;
  /** Whether polling should pause when document is hidden (default true) */
  pauseWhenHidden?: boolean;
  /** Callback on status changes */
  onStatusChange?: (status: PollerStatus) => void;
};

/**
 * Calculates next polling delay with exponential backoff and jitter.
 * - attempt 0: baseIntervalMs +/- 10% jitter
 * - attempt >= 1: min(maxIntervalMs, baseIntervalMs * 2^(attempt)) + jitter
 * - retryAfterMs: respects server Retry-After header if given
 */
export function calculateBackoff(
  baseIntervalMs: number,
  attempt: number,
  maxIntervalMs = 30_000,
  jitterRatio = 0.25,
  retryAfterMs?: number | null
): number {
  if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
    // Never shorten server-enforced cooldown; add 0-10% positive jitter to desynchronize retrying clients
    const jitter = Math.random() * (retryAfterMs * 0.1);
    return Math.round(retryAfterMs + jitter);
  }
  if (attempt <= 0) {
    const jitter = (Math.random() * 2 - 1) * (baseIntervalMs * 0.1);
    return Math.max(1000, Math.round(baseIntervalMs + jitter));
  }
  const factor = Math.min(attempt, 5);
  const expDelay = baseIntervalMs * Math.pow(2, factor);
  const capped = Math.min(expDelay, maxIntervalMs);
  // Distribute jitter within [capped * (1 - jitterRatio), capped] to guarantee jitter even under sustained cap
  const minDelay = Math.max(baseIntervalMs, capped * (1 - jitterRatio));
  const delay = minDelay + Math.random() * (capped - minDelay);
  return Math.round(delay);
}

export class AdaptiveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private queuedImmediate = false;
  private attempt = 0;
  private stopped = false;
  private baseIntervalMs: number;
  private maxIntervalMs: number;
  private jitterRatio: number;
  private pauseWhenHidden: boolean;
  private task: () => Promise<boolean | void>;
  private onStatusChange?: (status: PollerStatus) => void;
  private isOffline = false;

  private boundVisibilityChange: (() => void) | null = null;
  private boundOnline: (() => void) | null = null;
  private boundOffline: (() => void) | null = null;

  constructor(config: AdaptiveSchedulerConfig) {
    this.task = config.task;
    this.baseIntervalMs = config.baseIntervalMs;
    this.maxIntervalMs = config.maxIntervalMs ?? 30_000;
    this.jitterRatio = config.jitterRatio ?? 0.25;
    this.pauseWhenHidden = config.pauseWhenHidden ?? true;
    this.onStatusChange = config.onStatusChange;

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      this.isOffline = typeof navigator !== "undefined" && !navigator.onLine;

      this.boundVisibilityChange = () => {
        if (typeof document === "undefined") return;
        if (document.visibilityState === "hidden") {
          if (this.pauseWhenHidden) this.pause();
        } else {
          this.resume();
        }
      };

      this.boundOnline = () => {
        this.isOffline = false;
        this.resume();
      };

      this.boundOffline = () => {
        this.isOffline = true;
        this.pause();
      };

      document.addEventListener("visibilitychange", this.boundVisibilityChange);
      window.addEventListener("online", this.boundOnline);
      window.addEventListener("offline", this.boundOffline);
    }
  }

  public setBaseInterval(newIntervalMs: number): void {
    this.baseIntervalMs = newIntervalMs;
    // Reschedule if currently waiting normally
    if (this.timer && this.attempt === 0) {
      this.clearTimer();
      this.scheduleNext(0);
    }
  }

  public start(): void {
    this.stopped = false;
    this.attempt = 0;
    if (this.pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.emitStatus("paused", 0);
      return;
    }
    if (this.isOffline) {
      this.emitStatus("paused", 0);
      return;
    }
    this.execute();
  }

  public stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.detachListeners();
    this.emitStatus("stopped", 0);
  }

  public pause(): void {
    this.clearTimer();
    this.emitStatus("paused", 0);
  }

  public resume(): void {
    if (this.stopped) return;
    this.triggerNow(true);
  }

  public resetSchedule(): void {
    this.attempt = 0;
    this.clearTimer();
    this.scheduleNext();
  }

  public triggerNow(resetBackoff = false): void {
    if (this.stopped) return;
    if (resetBackoff) this.attempt = 0;
    this.clearTimer();
    if (this.inFlight) {
      this.queuedImmediate = true;
      return;
    }
    this.execute();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(retryAfterMs?: number | null): void {
    if (this.stopped) return;
    if (this.pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.emitStatus("paused", 0);
      return;
    }
    if (this.isOffline) {
      this.emitStatus("paused", 0);
      return;
    }

    const delay = calculateBackoff(
      this.baseIntervalMs,
      this.attempt,
      this.maxIntervalMs,
      this.jitterRatio,
      retryAfterMs
    );

    this.clearTimer();
    this.emitStatus(this.attempt > 0 ? "backoff" : "idle", delay);

    this.timer = setTimeout(() => {
      this.timer = null;
      this.execute();
    }, delay);
  }

  private async execute(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;
    this.emitStatus("polling", 0);

    let isSuccess = false;
    let retryAfterMs: number | null = null;
    let fatalStop = false;

    try {
      const result = await this.task();
      // If task explicitly returns false, treat as error; if void or truthy, treat as success
      isSuccess = result !== false;
    } catch (err: unknown) {
      isSuccess = false;
      const errorObj = err as { status?: number; retryAfterMs?: number | null };
      if (errorObj?.status === 403) {
        // Revoked access or fatal forbidden: stop infinite polling to avoid hammering 403
        fatalStop = true;
      }
      if (typeof errorObj?.retryAfterMs === "number") {
        retryAfterMs = errorObj.retryAfterMs;
      }
    } finally {
      this.inFlight = false;
    }

    if (this.stopped) return;

    if (fatalStop) {
      this.stop();
      return;
    }

    if (isSuccess) {
      this.attempt = 0;
    } else {
      this.attempt += 1;
    }

    if (this.queuedImmediate) {
      this.queuedImmediate = false;
      if (this.pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
        this.emitStatus("paused", 0);
        return;
      }
      if (this.isOffline) {
        this.emitStatus("paused", 0);
        return;
      }
      this.execute();
      return;
    }

    this.scheduleNext(retryAfterMs);
  }

  private emitStatus(state: PollerState, nextDelayMs: number): void {
    this.onStatusChange?.({
      state,
      attempt: this.attempt,
      nextDelayMs,
      isOffline: this.isOffline,
    });
  }

  private detachListeners(): void {
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      if (this.boundVisibilityChange && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", this.boundVisibilityChange);
      }
      if (this.boundOnline) {
        window.removeEventListener("online", this.boundOnline);
      }
      if (this.boundOffline) {
        window.removeEventListener("offline", this.boundOffline);
      }
    }
  }
}
