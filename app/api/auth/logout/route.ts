import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin, jsonError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    await supabase.auth.signOut();
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
