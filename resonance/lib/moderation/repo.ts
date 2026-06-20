import { createServerClient } from "@/lib/supabase/server";
import type { Report, ReportInput } from "./types";

/**
 * Server-side data access for moderation & safety. Service-role only; never
 * import into a Client Component. Plain CRUD within the `resonance` schema.
 */

// ---- reports ---------------------------------------------------------------

/** File a report. The caller's verified id is the reporter. */
export async function fileReport(
  worldId: string,
  reporterId: string,
  input: ReportInput,
): Promise<Report> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      world_id: worldId,
      reporter_user_id: reporterId,
      subject_user_id: input.subjectUserId ?? null,
      venue_id: input.venueId ?? null,
      reason: input.reason,
      detail: input.detail ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toReport(data);
}

/** Reports in a world, open ones first, newest within each status. */
export async function listReports(worldId: string): Promise<Report[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("world_id", worldId)
    .order("status", { ascending: true }) // 'open' sorts before 'reviewed'/'dismissed'
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).map(toReport);
  // 'open' < 'reviewed' < 'dismissed' alphabetically, but be explicit: open first.
  return rows.sort((a, b) => rank(a.status) - rank(b.status));
}

function rank(status: Report["status"]): number {
  return status === "open" ? 0 : status === "reviewed" ? 1 : 2;
}

// ---- blocks ----------------------------------------------------------------

/** Block a user. Idempotent on (blocker, blocked). */
export async function blockUser(
  worldId: string,
  blocker: string,
  blocked: string,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_user_id: blocker, blocked_user_id: blocked, world_id: worldId },
      { onConflict: "blocker_user_id,blocked_user_id" },
    );
  if (error) throw error;
}

/** Remove a block. */
export async function unblockUser(blocker: string, blocked: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_user_id", blocker)
    .eq("blocked_user_id", blocked);
  if (error) throw error;
}

/** The user ids the blocker has blocked. */
export async function listBlocks(blocker: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_user_id")
    .eq("blocker_user_id", blocker);
  if (error) throw error;
  return (data ?? []).map((r) => r.blocked_user_id as string);
}

// ---- mappers ---------------------------------------------------------------

function toReport(r: Record<string, unknown>): Report {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    reporterUserId: r.reporter_user_id as string,
    subjectUserId: (r.subject_user_id as string | null) ?? null,
    venueId: (r.venue_id as string | null) ?? null,
    reason: r.reason as string,
    detail: (r.detail as string | null) ?? null,
    status: r.status as Report["status"],
    createdAt: r.created_at as string,
  };
}
