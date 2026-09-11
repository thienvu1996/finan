import { createHash } from "node:crypto";

const secret = process.env.INTERNAL_RPC_SECRET;
if (!secret || secret.length < 32) {
  console.error("INTERNAL_RPC_SECRET phải có ít nhất 32 ký tự trong .env.local.");
  process.exit(1);
}

const hash = createHash("sha256").update(secret).digest("hex");
console.log(`insert into private.finan_runtime_secrets (key, secret_hash, updated_at)\nvalues ('internal_rpc', '${hash}', now())\non conflict (key) do update set secret_hash = excluded.secret_hash, updated_at = now();`);
