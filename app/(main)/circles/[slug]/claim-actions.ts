'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'

// "Claim this Circle" — a real member converts a demo circle into their own,
// in place. The circle stops being demo, they become its host, their answers
// reshape it, and they inherit a furnished circle (the demo neighbours stay and
// decay as real members join). See docs/DEMO-SYSTEM.md + ADR-081 (Phase 2).
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

  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, is_demo')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) throw new Error('Circle not found.')
  if (!(circle as { is_demo: boolean }).is_demo) {
    throw new Error('This circle is already real — nothing to claim.')
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
