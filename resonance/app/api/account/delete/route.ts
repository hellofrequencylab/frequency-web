import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { deleteUserData } from "@/lib/governance/repo";

export const dynamic = "force-dynamic";

/**
 * Delete the caller's own data (build plan: Data governance). Auth required, and
 * the body must carry an explicit confirmation token `{ confirm: "DELETE" }`, so
 * a stray POST never wipes an account. The purge only ever touches the verified
 * caller's own rows.
 */
export async function POST(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'confirmation required: send { "confirm": "DELETE" }' },
      { status: 400 },
    );
  }

  const { deleted } = await deleteUserData(userId);
  return NextResponse.json({ ok: true, deleted });
}
