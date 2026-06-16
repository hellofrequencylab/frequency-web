// Leaderboard opt-out — the pure read of a member's "hide me from the board"
// preference. Kept in its own (non-'use server') module so both the page (a server
// component) and the data layer can import it without pulling in the server action.
//
// Storage: profiles.meta.leaderboardOptOut (jsonb), the same per-user settings store
// the practice streak already lives in. No migration needed — the meta column exists.

/** Whether a member has hidden themselves from the individual leaderboard. */
export function isOptedOut(meta: Record<string, unknown> | null | undefined): boolean {
  return Boolean(meta?.leaderboardOptOut)
}
