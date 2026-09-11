import assert from "node:assert/strict";
import test from "node:test";
import { activeSubscription } from "../lib/subscription";

test("falls back to starter when a paid subscription is expired", () => {
  const now = Date.parse("2026-09-11T00:00:00Z");
  assert.equal(activeSubscription({ plan_id: "pro", status: "active", ends_at: "2026-09-10T23:59:59Z" }, now).plan_id, "starter");
  assert.equal(activeSubscription({ plan_id: "pro", status: "active", ends_at: "2026-09-12T00:00:00Z" }, now).plan_id, "pro");
  assert.equal(activeSubscription({ plan_id: "business", status: "cancelled", ends_at: null }, now).plan_id, "starter");
});
