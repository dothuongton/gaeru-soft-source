import { AsyncLocalStorage } from "node:async_hooks";

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const contexts = new AsyncLocalStorage<WorkerExecutionContext | undefined>();

export function runWithWorkerContext<T>(
  ctx: WorkerExecutionContext | undefined,
  run: () => T
): T {
  return contexts.run(ctx, run);
}

export function getWorkerContext(): WorkerExecutionContext | undefined {
  return contexts.getStore();
}

export function waitUntil(promise: Promise<unknown>): void {
  const ctx = getWorkerContext();
  if (ctx && typeof ctx.waitUntil === "function") {
    try {
      ctx.waitUntil(promise);
    } catch (e) {
      console.error("Failed to enqueue via ctx.waitUntil:", e);
    }
  } else {
    // In local non-worker runtime, catch errors safely
    promise.catch((err) => {
      console.error("Background task error (local execution):", err);
    });
  }
}
