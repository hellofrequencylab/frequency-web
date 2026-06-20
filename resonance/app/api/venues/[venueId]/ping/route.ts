import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Presence heartbeat (build plan §11). A client in a room POSTs this every ~20s;
 * the lobby counts pings seen in the last ~45s as "here now". Upsert keyed on the
 * (venue_id, user_id) primary key so a returning member refreshes their own row.
 */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { venueId } = await ctx.params;
  const supabase = createServerClient();
  const { error } = await supabase
    .from("presence_pings")
    .upsert(
      { venue_id: venueId, user_id: userId, last_seen: new Date().toISOString() },
      { onConflict: "venue_id,user_id" },
    );
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
