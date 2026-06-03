'use server'

import type { Json } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { recordEngagementEvent } from '@/lib/engagement/events'

// Persist a tour interaction into profiles.meta.tour and emit an analytics event
// (ADR-047 Phase 1). 'seen' marks a tip shown (won't re-show) + advances the pacing
// clock; 'dismissed' also marks seen; 'cta' is analytics-only. Member-scoped via
// the user client (RLS), mirroring app/onboarding/beta/actions.ts.
type TourEventKind = 'seen' | 'dismissed' | 'cta'
type Meta = Record<string, Json>

export async function recordTourEvent(tipId: string, kind: TourEventKind) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return

  const meta = (profile.meta as Meta | null) ?? {}
  const tour = (meta.tour as { seen?: string[]; dismissed?: string[] } | undefined) ?? {}
  const seen = new Set(tour.seen ?? [])
  const dismissed = new Set(tour.dismissed ?? [])
  if (kind === 'seen' || kind === 'dismissed') seen.add(tipId)
  if (kind === 'dismissed') dismissed.add(tipId)

  const nextTour = {
    version: 1,
    seen: [...seen],
    dismissed: [...dismissed],
    lastShownAt: new Date().toISOString(),
  }

  await supabase
    .from('profiles')
    .update({ meta: { ...meta, tour: nextTour } })
    .eq('id', profile.id)

  // Activation-funnel analytics (best-effort; no rewards — no gamificationEvent).
  void recordEngagementEvent({
    idempotencyKey: `tour:${profile.id}:${tipId}:${kind}`,
    source: 'web',
    eventType: `onboarding_tip_${kind}`,
    actorProfileId: profile.id,
    context: { tipId },
  }).catch(() => {})
}
