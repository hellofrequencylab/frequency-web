'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

// Leaderboard opt-out action — a one-tap "hide me from the board" preference.
// Cooperative design: ranking is secondary and should feel opt-in, so a member can
// step off the individual board at any time and still count toward the collective
// goal (the shared total reads from current_season_zaps, which this never touches).
//
// Storage: profiles.meta.leaderboardOptOut (jsonb), the same per-user settings store
// the practice streak already lives in. No migration needed — the meta column exists.
// We read-modify-write the whole meta blob so we never clobber sibling keys. The pure
// read of the flag lives in ./opt-out (so non-action callers don't import a server action).

// The preference is per MEMBER, not per board, so one action serves every board that shows rows.
// `boardPath` only says which OTHER page to repaint after the write. It arrives from a client
// component, so it is matched against a closed allowlist of board routes rather than trusted: an
// arbitrary string here would let a caller invalidate any page in the app.
// The Circle board lives under /practice since the five-tab restructure (the board measures effort
// against your own usual week, so it is a view of your practice rather than a peer entity). The old
// /leaderboard path stays in this list because it still exists as a permanent redirect, and a stale
// link that redirects should not silently stop revalidating.
//
// ⚠️ This allowlist is what makes the "hide me from the board" toggle refresh the page you are
// looking at. Miss the path and the write still SUCCEEDS while the board keeps showing your row
// until something else revalidates it, which reads as the toggle being broken.
const BOARD_PATHS = [
  /^\/circles\/[a-z0-9-]{1,80}\/practice$/,
  /^\/circles\/[a-z0-9-]{1,80}\/leaderboard$/,
] as const

function safeBoardPath(path: string | undefined): string | null {
  if (!path || path === '/crew/leaderboard') return null
  return BOARD_PATHS.some((re) => re.test(path)) ? path : null
}

/** Set the viewer's "hide me from the board" preference. Always keys off the
 *  session profile, never the client, so a member can only change their OWN. */
export async function setLeaderboardVisibility(
  hidden: boolean,
  boardPath?: string,
): Promise<{ ok: boolean; hidden: boolean }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, hidden }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('meta')
    .eq('id', profileId)
    .maybeSingle()

  const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
  const nextMeta = { ...meta, leaderboardOptOut: hidden }

  await admin.from('profiles').update({ meta: nextMeta }).eq('id', profileId)

  revalidatePath('/crew/leaderboard')
  const also = safeBoardPath(boardPath)
  if (also) revalidatePath(also)
  return { ok: true, hidden }
}
