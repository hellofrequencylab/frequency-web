import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { exportUserData } from "@/lib/governance/repo";

export const dynamic = "force-dynamic";

/**
 * Export the caller's own data (build plan: Data governance). Auth required.
 * Returns every row keyed to the verified caller across the `resonance` schema
 * as a JSON map of table -> rows, served as a download.
 */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await exportUserData(userId);
  const body = JSON.stringify(
    { userId, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="resonance-data-export.json"',
      "cache-control": "no-store",
    },
  });
}
