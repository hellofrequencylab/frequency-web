'use server'

import { createClient } from '@/lib/supabase/server'
import { mergeProfileMetaPath } from '@/lib/profiles/meta'
import { recordEngagementEvent } from '@/lib/engagement/events'

// Persist where the member is in the guided spotlight tour, so it survives a
// reload / second device: 'completed' (walked the whole thing), 'paused' (stepped
// out partway — the guide offers Resume), or 'skipped'. Stored in
// profiles.meta.tour.spotlight; analytics event mirrors the kind.
type SpotlightState = 'completed' | 'paused' | 'skipped'

export async function setSpotlightTourState(state: SpotlightState, atStop = 0) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return

  // 2026-09-07 (LIVE-171): only `tour.spotlight` is sent, merged INSIDE the `tour` key server-side, so
  // the tip lists recordTourEvent owns are never read here and sent back stale.
  const { error } = await mergeProfileMetaPath(supabase, profile.id, ['tour'], {
    spotlight: { status: state, atStop, at: new Date().toISOString() },
  })
  if (error) {
    console.error('[setSpotlightTourState] tour merge failed', { profileId: profile.id, error })
    return
  }

  void recordEngagementEvent({
    idempotencyKey: `tour-spotlight:${profile.id}:${state}:${atStop}`,
    source: 'web',
    eventType: `onboarding_tour_${state}`,
    actorProfileId: profile.id,
    context: { atStop },
  }).catch(() => {})
}
