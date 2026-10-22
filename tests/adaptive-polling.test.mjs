import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateBackoff, AdaptiveScheduler } from "../lib/adaptive-polling.ts";

test("calculateBackoff: attempt 0 returns base interval with bounded jitter", () => {
  for (let i = 0; i < 20; i++) {
    const delay = calculateBackoff(5000, 0);
    assert.ok(delay >= 4500 && delay <= 5500, `Delay ${delay} should be within 4500-5500ms`);
  }
});

test("calculateBackoff: exponential backoff on consecutive failures", () => {
  const d1 = calculateBackoff(5000, 1, 60000, 0); // factor 1 -> 5000 * 2^1 = 10000
  assert.equal(d1, 10000);

  const d2 = calculateBackoff(5000, 2, 60000, 0); // factor 2 -> 5000 * 2^2 = 20000
  assert.equal(d2, 20000);

  const d3 = calculateBackoff(5000, 3, 60000, 0); // factor 3 -> 5000 * 2^3 = 40000
  assert.equal(d3, 40000);
});

test("calculateBackoff: respects maxIntervalMs cap and retains jitter under cap", () => {
  const delays = new Set();
  for (let i = 0; i < 30; i++) {
    const delay = calculateBackoff(5000, 10, 30000, 0.25);
    assert.ok(delay >= 22500 && delay <= 30000, `Delay ${delay} should be within [22500, 30000]`);
    delays.add(delay);
  }
  assert.ok(delays.size > 1, "Delays under sustained cap must exhibit jitter, not collapse to identical values");
});

test("calculateBackoff: honors Retry-After header duration without truncating below server instruction", () => {
  const delay = calculateBackoff(5000, 2, 60000, 0.25, 12000);
  assert.ok(delay >= 12000 && delay <= 13200, `Delay ${delay} should honor retryAfterMs`);

  const longDelay = calculateBackoff(5000, 2, 30000, 0.25, 120000);
  assert.ok(longDelay >= 120000, `Long Retry-After (120s) must not be truncated to 30s cap`);
});

test("AdaptiveScheduler: prevents overlapping tasks and enforces single in-flight", async () => {
  let inFlightCount = 0;
  let maxConcurrent = 0;
  let runCount = 0;

  const scheduler = new AdaptiveScheduler({
    baseIntervalMs: 50,
    maxIntervalMs: 200,
    pauseWhenHidden: false,
    task: async () => {
      inFlightCount++;
      runCount++;
      maxConcurrent = Math.max(maxConcurrent, inFlightCount);
      await new Promise(r => setTimeout(r, 40));
      inFlightCount--;
      return true;
    },
  });

  scheduler.start();
  // Rapidly triggerNow multiple times
  scheduler.triggerNow();
  scheduler.triggerNow();
  scheduler.triggerNow();

  await new Promise(r => setTimeout(r, 200));
  scheduler.stop();

  assert.equal(maxConcurrent, 1, "There must never be more than 1 concurrent task in flight");
  assert.ok(runCount >= 2, `Task should have run at least 2 times, ran ${runCount}`);
});

test("AdaptiveScheduler: stops automatically on 403 Forbidden to prevent hammering", async () => {
  let callCount = 0;
  let stoppedState = false;

  const scheduler = new AdaptiveScheduler({
    baseIntervalMs: 20,
    maxIntervalMs: 100,
    pauseWhenHidden: false,
    task: async () => {
      callCount++;
      const err = new Error("Forbidden");
      (err).status = 403;
      throw err;
    },
    onStatusChange: (status) => {
      if (status.state === "stopped") stoppedState = true;
    },
  });

  scheduler.start();
  await new Promise(r => setTimeout(r, 80));

  assert.equal(callCount, 1, "Should only attempt once and then immediately stop on 403");
  assert.equal(stoppedState, true, "Scheduler status should be stopped");
  scheduler.stop();
});

test("AdaptiveScheduler: resets attempt counter on success and respects resetSchedule", async () => {
  let statusList = [];
  let shouldFail = true;

  const scheduler = new AdaptiveScheduler({
    baseIntervalMs: 30,
    maxIntervalMs: 200,
    jitterRatio: 0,
    pauseWhenHidden: false,
    task: async () => {
      if (shouldFail) {
        throw new Error("Temporary network error");
      }
      return true;
    },
    onStatusChange: (status) => {
      statusList.push(status);
    },
  });

  scheduler.start();
  // Wait for first run (fails)
  await new Promise(r => setTimeout(r, 50));
  assert.ok(statusList.some(s => s.state === "backoff" && s.attempt >= 1));

  // Now fix the failure
  shouldFail = false;
  scheduler.triggerNow(true);
  await new Promise(r => setTimeout(r, 50));

  // Next status after success should be attempt 0
  const latest = statusList[statusList.length - 1];
  assert.equal(latest.attempt, 0, "Attempt counter should reset to 0 upon success");

  scheduler.stop();
});
