'use server'

import { getMyProfileId } from '@/lib/auth'
import { recordCompletionSeen } from '@/lib/quest/celebration'

// Mark a Journey-finish celebration as seen — the client HeroMoment calls this
// once it has shown the moment (on mount), so the hub greets each finish (incl.
// the season-complete Master moment) exactly once. profileId always comes from
// the session here, never the client, so a member can only mark their OWN
// celebration seen; the client passes only the completion id it was handed.
// Best-effort and side-effect-free for the caller: it never throws, so a failed
// write just means the moment may show once more.

export async function markJourneyCompletionSeen(completionId: string): Promise<void> {
  if (!completionId || typeof completionId !== 'string') return

  const profileId = await getMyProfileId()
  if (!profileId) return

  try {
    await recordCompletionSeen(profileId, completionId)
  } catch {
    // Swallow — the worst case is the celebration fires again next visit.
  }
}
