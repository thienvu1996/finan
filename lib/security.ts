import { createHash } from "node:crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { requireServerEnv } from "@/lib/supabase/env";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") { super(message); }
}

export function jsonError(error: unknown) {
  const known = error instanceof HttpError;
  const response = Response.json(
    { message: known ? error.message : "Có lỗi máy chủ. Vui lòng thử lại.", code: known ? error.code : "INTERNAL_ERROR" },
    { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } },
  );
  return response;
}

export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new HttpError(403, "Yêu cầu không hợp lệ.", "CROSS_SITE_REQUEST");
  const origin = request.headers.get("origin");
  if (!origin) throw new HttpError(403, "Thiếu thông tin nguồn yêu cầu.", "ORIGIN_REQUIRED");
  let expected: string;
  try { expected = new URL(request.url).origin; } catch { throw new HttpError(403, "Nguồn yêu cầu không hợp lệ.", "INVALID_ORIGIN"); }
  if (origin !== expected) throw new HttpError(403, "Yêu cầu khác nguồn đã bị chặn.", "ORIGIN_MISMATCH");
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.", "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new HttpError(400, "Thiếu dữ liệu yêu cầu.", "EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Dữ liệu gửi lên quá lớn.", "PAYLOAD_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { throw new HttpError(400, "Dữ liệu JSON không hợp lệ.", "INVALID_JSON"); }
}

export async function readText(request: Request, maxBytes = 65_536) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.", "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new HttpError(400, "Thiếu dữ liệu yêu cầu.", "EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Dữ liệu gửi lên quá lớn.", "PAYLOAD_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function requestSubject(request: Request) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function enforceRateLimit(subject: string, action: string, limit: number, windowSeconds: number) {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("finan_rate_limit", {
    p_internal_secret: requireServerEnv("INTERNAL_RPC_SECRET"),
    p_subject: subject,
    p_action_key: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new HttpError(503, "Chưa thể kiểm tra giới hạn truy cập.", "RATE_LIMIT_UNAVAILABLE");
  if (!data) throw new HttpError(429, "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", "RATE_LIMITED");
}
