import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { buildQrUrl, parseSePayWebhook, publicOrder, verifySePaySignature } from "../lib/billing";
import { resolveAppOrigin, safeSameOriginRedirect } from "../lib/redirect";

test("verifies a fresh SePay HMAC and rejects tampering/replay", () => {
  process.env.SEPAY_WEBHOOK_SECRET = "test-webhook-secret-with-enough-entropy";
  const now = 1_800_000_000;
  const body = JSON.stringify({ id: 321, transactionDate: "2026-09-11 10:30:00", accountNumber: "123", gateway: "MB", transferType: "in", transferAmount: 99000 });
  const timestamp = String(now);
  const signature = `sha256=${createHmac("sha256", process.env.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex")}`;
  assert.equal(verifySePaySignature(body, timestamp, signature, now), true);
  assert.equal(verifySePaySignature(`${body} `, timestamp, signature, now), false);
  assert.equal(verifySePaySignature(body, timestamp, signature, now + 301), false);
});

test("validates webhook values and normalizes Vietnam bank time", () => {
  const event = parseSePayWebhook(JSON.stringify({ id: 81, gateway: "VCB", transactionDate: "2026-09-11 10:30:00", accountNumber: "0123", subAccount: "", code: null, content: "Thanh toan fin1234567890abcdef1234", transferType: "in", transferAmount: 249000, referenceCode: "REF-1" }));
  assert.equal(event.id, 81);
  assert.equal(event.transactionAt, "2026-09-11T03:30:00.000Z");
  assert.equal(event.paymentCode, "FIN1234567890ABCDEF1234");
  assert.equal(event.payloadHash.length, 64);
  assert.equal(parseSePayWebhook(JSON.stringify({ ...event, id: 0 })).id, 0);
  assert.throws(() => parseSePayWebhook(JSON.stringify({ ...event, id: -1 })));
});

test("builds an encoded VietQR URL from server billing values", () => {
  const url = new URL(buildQrUrl({ account: "001 234", bankCode: "VCB", bankBin: "970436", accountName: "TEST", subAccount: "" }, 99000, "FIN A&B"));
  assert.equal(url.origin, "https://vietqr.app");
  assert.equal(url.searchParams.get("acc"), "001 234");
  assert.equal(url.searchParams.get("des"), "FIN A&B");
  assert.equal(url.searchParams.get("amount"), "99000");
});

test("builds pending-order instructions from its immutable bank snapshot", () => {
  const order = publicOrder({ id: "1", plan_id: "pro", amount: 99000, status: "pending", payment_code: "FIN1234567890ABCDEF1234", bank_account: "MAIN-001", bank_code: "VCB", bank_bin: "970436", account_name: "FINAN", sub_account: "VA-009" });
  assert.equal(order.bankAccount, "VA-009");
  assert.equal(new URL(order.qrUrl).searchParams.get("acc"), "VA-009");
});

test("keeps auth redirects on the application origin", () => {
  const requestUrl = new URL("https://finan.example/auth/callback");
  assert.equal(safeSameOriginRedirect(requestUrl, "/#plans").href, "https://finan.example/#plans");
  assert.equal(safeSameOriginRedirect(requestUrl, "/\\evil.example").href, "https://finan.example/");
  assert.equal(safeSameOriginRedirect(requestUrl, "https://evil.example").href, "https://finan.example/");
});

test("prefers the canonical deployment origin for auth emails", () => {
  const requestUrl = new URL("http://localhost:3000/api/auth/signup");
  assert.equal(resolveAppOrigin(requestUrl, { appUrl: "https://finan.example/path" }), "https://finan.example");
  assert.equal(resolveAppOrigin(requestUrl, { productionUrl: "finan-team.vercel.app" }), "https://finan-team.vercel.app");
  assert.equal(resolveAppOrigin(requestUrl, { appUrl: "javascript:alert(1)" }), "http://localhost:3000");
});
