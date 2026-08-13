import assert from "node:assert/strict";
import test from "node:test";
import {
  createReservationRateLimitKey,
  isAutomatedReservationRequest,
  isReservationRateLimited,
} from "../src/lib/reservation-request-guard.ts";

test("rate-limit keys separate students and client addresses", () => {
  const firstRequest = new Request("https://example.test/api/reservations", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  const secondRequest = new Request("https://example.test/api/reservations", {
    headers: { "x-forwarded-for": "203.0.113.11" },
  });

  const firstKey = createReservationRateLimitKey(firstRequest, " 20260001 ");
  assert.equal(firstKey, createReservationRateLimitKey(firstRequest, "20260001"));
  assert.notEqual(firstKey, createReservationRateLimitKey(firstRequest, "20260002"));
  assert.notEqual(firstKey, createReservationRateLimitKey(secondRequest, "20260001"));
  assert.match(firstKey, /^[a-f0-9]{64}$/);
  assert.equal(firstKey.includes("20260001"), false);
});

test("confirmed bots are blocked and BotID failures fail open", async () => {
  assert.equal(
    await isAutomatedReservationRequest(async () => ({ isBot: true })),
    true,
  );
  assert.equal(
    await isAutomatedReservationRequest(async () => {
      throw new Error("temporary BotID failure");
    }),
    false,
  );
});

test("rate-limit decisions are enforced and service failures fail open", async () => {
  const request = new Request("https://example.test/api/reservations", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });

  assert.equal(
    await isReservationRateLimited(
      request,
      "20260001",
      async (_id, options) => {
        assert.match(options.rateLimitKey, /^[a-f0-9]{64}$/);
        return { rateLimited: true };
      },
    ),
    true,
  );
  assert.equal(
    await isReservationRateLimited(
      request,
      "20260001",
      async () => ({ rateLimited: false, error: "not-found" }),
    ),
    false,
  );
});
