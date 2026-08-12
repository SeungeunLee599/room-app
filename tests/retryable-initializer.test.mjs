import assert from "node:assert/strict";
import test from "node:test";
import { createRetryableInitializer } from "../src/lib/retryable-initializer.ts";

test("concurrent calls share one initialization", async () => {
  let initializationCount = 0;
  let releaseInitialization;
  const initializationGate = new Promise((resolve) => {
    releaseInitialization = resolve;
  });

  const initialize = createRetryableInitializer(async () => {
    initializationCount += 1;
    await initializationGate;
  });

  const calls = Array.from({ length: 100 }, () => initialize());
  assert.equal(initializationCount, 1);

  releaseInitialization();
  await Promise.all(calls);
  await initialize();

  assert.equal(initializationCount, 1);
});

test("a failed initialization can be retried", async () => {
  let initializationCount = 0;
  const initialize = createRetryableInitializer(async () => {
    initializationCount += 1;
    if (initializationCount === 1) {
      throw new Error("temporary failure");
    }
  });

  await assert.rejects(initialize(), /temporary failure/);
  await initialize();

  assert.equal(initializationCount, 2);
});
