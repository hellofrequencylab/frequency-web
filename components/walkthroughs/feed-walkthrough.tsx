import type { Walkthrough } from '@/lib/walkthroughs'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectWalkthroughForMember } from '@/lib/walkthroughs/runtime'
import { markWalkthroughSeen } from '@/lib/walkthroughs/progress'
import { WalkthroughCard } from '@/components/walkthroughs/walkthrough-card'

// Walkthroughs Phase B — the feed entry point (Server Component). Reads the member's
// own state (community_role, created_at, meta), runs the pull-based selection, and — if
// a walkthrough qualifies and the cadence allows it — marks it seen (fire-and-forget, so
// the next load rests it per its cadence) and renders the gentle in-feed card. Renders
// nothing when there's nothing to show. Best-effort: any failure resolves to null so the
// feed never blocks on or breaks over a walkthrough.

// Resolve the walkthrough to show (or null). Best-effort: any failure → null, so the
// feed never blocks on or breaks over a walkthrough. JSX is constructed OUTSIDE this
// try/catch (rendering errors belong to an error boundary, not a catch).
async function resolveWalkthrough(profileId: string): Promise<Walkthrough | null> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('community_role, created_at, meta')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile) return null

    const walkthrough = await selectWalkthroughForMember({
      role: profile.community_role ?? 'member',
      createdAt: profile.created_at ?? null,
      meta: profile.meta,
    })
    if (!walkthrough) return null

    // Mark it seen now that we're showing the card (advances the cadence clock).
    // Fire-and-forget — the render must not wait on the write.
    void markWalkthroughSeen(profileId, walkthrough.slug).catch(() => {})

    return walkthrough
  } catch {
    return null
  }
}

export async function FeedWalkthrough({ profileId }: { profileId: string }) {
  const walkthrough = await resolveWalkthrough(profileId)
  if (!walkthrough) return null
  return <WalkthroughCard walkthrough={walkthrough} />
}
