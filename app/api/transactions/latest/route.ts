import { requireUser } from "@/lib/auth";
import { HttpError, jsonError } from "@/lib/security";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase
      .from("finan_transactions")
      .select("event_id,received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new HttpError(500, "Chưa thể kiểm tra giao dịch mới.", "REALTIME_CHECK_FAILED");

    return Response.json(
      {
        eventId: data?.event_id != null ? String(data.event_id) : null,
        receivedAt: data?.received_at || null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
