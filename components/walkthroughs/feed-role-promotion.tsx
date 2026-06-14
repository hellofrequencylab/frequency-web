import type { Walkthrough } from '@/lib/walkthroughs'
import { createAdminClient } from '@/lib/supabase/admin'
import { readProgressMap } from '@/lib/walkthroughs/runtime'
import { markWalkthroughSeen } from '@/lib/walkthroughs/progress'
import { selectPendingPromotionTour } from '@/lib/walkthroughs/role-promotion'
import { WalkthroughCard } from '@/components/walkthroughs/walkthrough-card'

// Role-promotion tours (P1.8) — the feed entry point (Server Component). Mirrors
// FeedWalkthrough, but instead of the operator-authored pull from the `walkthrough`
// table it surfaces the CODE-SHIPPED promotion tour assignRole queued when the member's
// trust role advanced. Reads the member's own role + saved progress, picks the highest
// pending-and-unfinished tour, marks it seen (fire-and-forget), and renders the same
// gentle <WalkthroughCard> (which opens the shared lightbox). Best-effort: any failure
// resolves to null so the feed never blocks on or breaks over a tour.

async function resolvePromotionTour(profileId: string): Promise<Walkthrough | null> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('community_role, meta')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile) return null

    const tour = selectPendingPromotionTour(profile.community_role ?? 'member', readProgressMap(profile.meta))
    if (!tour) return null

    // Advance the cadence clock now that we're showing it (cadence is until_done, so it
    // returns until the member finishes or dismisses). Fire-and-forget.
    void markWalkthroughSeen(profileId, tour.slug).catch(() => {})

    return tour
  } catch {
    return null
  }
}

export async function FeedRolePromotion({ profileId }: { profileId: string }) {
  const tour = await resolvePromotionTour(profileId)
  if (!tour) return null
  return <WalkthroughCard walkthrough={tour} />
}
