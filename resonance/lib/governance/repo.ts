import { createServerClient } from "@/lib/supabase/server";

/**
 * Data governance over the `resonance` schema (build plan: Data governance).
 *
 * A member can export and delete their own data. Both paths run through the
 * service-role client and are SCOPED TO ONE USER ID at every step: a query only
 * ever matches the caller's own rows, never another member's.
 *
 * User identity is a plain uuid carried across many tables (ADR-002, no
 * cross-schema FK). The two helpers below enumerate every place that id lands.
 */

type Rows = Record<string, unknown>[];

/** A user-keyed table and the column(s) that hold the user id in it. */
type UserTable = { table: string; columns: string[] };

/**
 * Tables that store rows BY user id (one row "belongs to" the user). Export
 * reads these; delete removes the user's rows from each.
 */
const OWNED_TABLES: UserTable[] = [
  { table: "venue_seats", columns: ["occupant_user_id"] },
  { table: "queue_items", columns: ["user_id"] },
  { table: "votes", columns: ["user_id"] },
  { table: "profiles", columns: ["user_id"] },
  { table: "zaps_ledger", columns: ["user_id"] },
  { table: "reputation", columns: ["user_id"] },
  { table: "event_tickets", columns: ["user_id"] },
  { table: "presence_pings", columns: ["user_id"] },
  { table: "user_inventory", columns: ["user_id"] },
  { table: "game_scores", columns: ["user_id"] },
  // creator_earnings holds the user in two roles: as the creator who was paid
  // and as the buyer who paid. Both are personal data, so both are exported and
  // purged.
  { table: "creator_earnings", columns: ["creator_user_id", "buyer_user_id"] },
];

/**
 * Events the user HOSTS. These are not "owned rows" in the simple sense: an
 * event is a thing other people hold tickets to, and event_tickets cascades on
 * `events` delete (0008). We treat a hosted event as the host's data and remove
 * it; the database cascade then clears its tickets. (Documented in
 * docs/DATA-GOVERNANCE.md.)
 */
const HOST_TABLE: UserTable = { table: "events", columns: ["host_user_id"] };

/** Build an `or` filter that matches the user id in any of the given columns. */
function userFilter(userId: string, columns: string[]): string {
  return columns.map((c) => `${c}.eq.${userId}`).join(",");
}

/**
 * Gather every row keyed to the user across the schema, as a map of
 * table -> rows. A missing table is reported as an empty list rather than
 * aborting the whole export, so one gap never blocks a member's download.
 */
export async function exportUserData(
  userId: string,
): Promise<Record<string, unknown[]>> {
  const supabase = createServerClient();
  const out: Record<string, unknown[]> = {};

  const tables: UserTable[] = [...OWNED_TABLES, HOST_TABLE];
  for (const { table, columns } of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .or(userFilter(userId, columns));
    if (error) {
      // Report the gap in-band so the export stays useful and auditable.
      out[table] = [];
      out[`${table}__error`] = [error.message];
      continue;
    }
    out[table] = (data as Rows) ?? [];
  }

  return out;
}

/**
 * Delete the user's rows across the schema and return a per-table deleted count.
 *
 * Hosted events go first: deleting an event cascades its tickets (0008), so
 * removing them before the per-user passes avoids leaving the host's own ticket
 * rows orphaned in the count. Each owned table is then purged by the user id.
 *
 * Defensive: a missing-table (or otherwise failing) delete is recorded as a -1
 * count and skipped, so one gap never aborts the rest of the purge.
 */
export async function deleteUserData(
  userId: string,
): Promise<{ deleted: Record<string, number> }> {
  const supabase = createServerClient();
  const deleted: Record<string, number> = {};

  const passes: UserTable[] = [HOST_TABLE, ...OWNED_TABLES];
  for (const { table, columns } of passes) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .or(userFilter(userId, columns))
      .select("*");
    if (error) {
      // -1 flags a table that could not be purged (e.g. missing). The rest of
      // the purge still runs.
      deleted[table] = -1;
      continue;
    }
    deleted[table] = (data as Rows | null)?.length ?? 0;
  }

  return { deleted };
}
