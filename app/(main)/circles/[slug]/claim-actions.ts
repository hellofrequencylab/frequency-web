'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { rateLimitOk } from '@/lib/rate-limit'

// "Claim this Circle" — a real member converts a demo circle into their own,
// in place. The circle stops being demo, they become its host, their answers
// reshape it, and they inherit a furnished circle (the demo neighbours stay and
// decay as real members join). See docs/DEMO-SYSTEM.md + ADR-1048 (Phase 2).
export async function claimCircle(
  circleId: string,
  answers: { name?: string; about?: string; practiceId?: string | null },
): Promise<{ slug: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in to claim a circle.')

  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('id, is_demo')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me || (me as { is_demo: boolean }).is_demo) {
    throw new Error('Only real members can claim a circle.')
  }
  const myId = (me as { id: string }).id

  // ── THE FARMING GATE (OWN-041) ────────────────────────────────────────────────────────────
  // `circleId` is a client argument and this action deliberately does NOT require the caller to
  // be a member: DEMO-SYSTEM.md's flow is that a signed-in real member VIEWING a demo circle sees
  // the claim banner, so a membership check would break ADR-1048 rather than harden it. What is
  // farmable is the REWARD, not the claim — each claim awards `circle_start` (100 Zaps) and, with
  // a practice, `circle_activate` (40), and while `recordEngagementEvent` is idempotent per circle
  // the Zap award is not. So a member who enumerates demo circle ids collects 140 a time.
  //
  // A per-profile rate limit closes that without touching the flow or under-rewarding a real host:
  // claiming three sample circles in a day is already far past any honest use, and someone
  // genuinely starting circles does it over weeks, not in a loop. The operator-side cap on the two
  // zap_config rows is the other half and is set independently, so neither depends on the other.
  if (!(await rateLimitOk('circle:claim', myId, 3, '1 d'))) {
    throw new Error('You have claimed a few circles already today. Try again tomorrow.')
  }

  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, is_demo')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) throw new Error('Circle not found.')
  if (!(circle as { is_demo: boolean }).is_demo) {
    throw new Error('This circle is already real. Nothing to claim.')
  }
  const slug = (circle as { slug: string }).slug

  // 1. Convert in place: no longer demo, you're the host, your words apply.
  const patch: { is_demo: boolean; host_id: string; status: 'active'; name?: string; about?: string } = {
    is_demo: false,
    host_id: myId,
    status: 'active',
  }
  const newName = answers.name?.trim()
  const newAbout = answers.about?.trim()
  if (newName) patch.name = newName
  if (newAbout) patch.about = newAbout
  const { error: upErr } = await admin.from('circles').update(patch).eq('id', circleId)
  if (upErr) throw new Error(upErr.message)

  // 2. Make sure you're a member, as host.
  await admin
    .from('memberships')
    .upsert(
      { profile_id: myId, circle_id: circleId, status: 'active', volunteer_role: 'host' },
      { onConflict: 'profile_id,circle_id' },
    )

  // 3. Set the first practice (if chosen).
  if (answers.practiceId) {
    await admin.from('circle_practices').update({ active: false }).eq('circle_id', circleId).eq('active', true)
    await admin
      .from('circle_practices')
      .insert({ circle_id: circleId, practice_id: answers.practiceId, set_by: myId, active: true })
  }

  // 4. Reward the doing (start + activate), and log the claim. Never let a
  //    reward read break the claim.
  try {
    await awardZapsForAction(myId, 'circle_start')
    if (answers.practiceId) await awardZapsForAction(myId, 'circle_activate')
  } catch {
    /* rewards are best-effort */
  }
  await recordEngagementEvent({
    idempotencyKey: `circle_claim:${circleId}`,
    source: 'web',
    eventType: 'circle.claimed',
    actorProfileId: myId,
    context: { circleId, slug, kind: 'circle_claim' },
  }).catch(() => {})

  revalidatePath('/', 'layout')
  return { slug }
}
