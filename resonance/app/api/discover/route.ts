import { NextResponse } from "next/server";
import { discover } from "@/lib/worlds/repo";

export const dynamic = "force-dynamic";

/**
 * Cross-world discovery (build plan §18): live venues and upcoming events across
 * ALL worlds. Public read; no auth required.
 */
export async function GET() {
  const feed = await discover();
  return NextResponse.json(feed);
}
