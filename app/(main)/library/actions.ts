'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { awardZapsForAction } from '@/lib/zaps'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { type ContentType, stampProgramSpaceId } from '@/lib/library'

function db(): SupabaseClient {
  return createAdminClient()
}

const slugify = (s: string) =>
  `${s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'program'}-${Math.random().toString(36).slice(2, 7)}`

// Anyone can submit a Program (a real-world outreach toolkit). It enters the
// review queue as 'pending'; a Host/Guide+ approves it into the Library.
export async function submitProgram(input: {
  title: string
  summary: string
  body: string
  pillar?: string
}): Promise<ActionResult<{ id: string }>> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to submit a program.')
  const title = input.title?.trim()
  if (!title) return fail('A program needs a title.')

  // Stamp the owning Space (defaults to the root space, so this single-tenant flow keeps
  // behaving exactly as today). space_id is newer than the generated DB types — cast the payload
  // to reach the column (ADR-246); omit the field when the root row is missing.
  const spaceId = await stampProgramSpaceId()
  const { data, error } = await db()
    .from('programs')
    .insert({
      slug: slugify(title),
      title,
      summary: input.summary?.trim() || null,
      body: input.body?.trim() || null,
      pillar: input.pillar?.trim() || null,
      author_id: me,
      status: 'pending',
      ...(spaceId ? { space_id: spaceId } : {}),
    } as never)
    .select('id')
    .maybeSingle()
  if (error) return fail(error.message)
  revalidatePath('/library')
  return ok({ id: (data as { id: string }).id })
}

// Submit a practice or journey you own into the Library (→ pending review). It
// stays private to you until a leader approves it (then it goes public).
export async function submitToLibrary(type: 'practice' | 'journey', id: string): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in first.')
  const d = db()
  if (type === 'practice') {
    const { data: row } = await d.from('practices').select('created_by').eq('id', id).maybeSingle()
    if ((row as { created_by?: string } | null)?.created_by !== me) return fail('You can only submit practices you created.')
    await d.from('practices').update({ status: 'pending' }).eq('id', id)
  } else {
    const { data: row } = await d.from('journey_plans').select('author_id').eq('id', id).maybeSingle()
    if ((row as { author_id?: string } | null)?.author_id !== me) return fail('You can only submit journeys you created.')
    await d.from('journey_plans').update({ status: 'pending' }).eq('id', id)
  }
  revalidatePath('/library')
  return ok()
}

// Leadership review — a circle Host or any Guide+ approves/rejects into the pool.
// Approve also flips the item public so the existing browse filters surface it.
export async function reviewContent(
  type: ContentType,
  id: string,
  decision: 'approve' | 'reject',
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) return fail('Only a Host or Guide+ can review.')
  const d = db()
  const approved = decision === 'approve'
  const review = { status: approved ? 'approved' : 'rejected', reviewed_by: caller.id, reviewed_at: new Date().toISOString() }

  if (type === 'practice') {
    await d.from('practices').update({ ...review, ...(approved ? { is_public: true } : {}) }).eq('id', id)
  } else if (type === 'program') {
    await d.from('programs').update(review).eq('id', id)
  } else {
    await d.from('journey_plans').update({ ...review, ...(approved ? { visibility: 'public' } : {}) }).eq('id', id)
  }
  revalidatePath('/library')
  revalidatePath('/library/review')
  return ok()
}

// Adopt a Program — a real-world outreach act → zaps (program_run). Idempotent on
// the unique (program_id, profile_id); only the first adoption awards.
export async function adoptProgram(id: string): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to adopt a program.')
  const d = db()
  const { error } = await d.from('program_adoptions').insert({ program_id: id, profile_id: me })
  if (error) {
    if (error.code === '23505') return ok() // already adopted — no double award
    return fail(error.message)
  }
  // Keep the denormalized count in step, then award the real-world zaps.
  const { count } = await d.from('program_adoptions').select('id', { count: 'exact', head: true }).eq('program_id', id)
  await d.from('programs').update({ adopt_count: count ?? 0 }).eq('id', id)
  await awardZapsForAction(me, 'program_run')
  revalidatePath('/library')
  return ok()
}

// Toggle a rating (a "love" — the best-of signal) on any catalog item.
export async function rateContent(type: ContentType, id: string): Promise<ActionResult<{ rated: boolean }>> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to rate.')
  const d = db()
  const { data: existing } = await d
    .from('content_ratings')
    .select('id')
    .eq('profile_id', me)
    .eq('content_type', type)
    .eq('content_id', id)
    .maybeSingle()
  if (existing) {
    await d.from('content_ratings').delete().eq('id', (existing as { id: string }).id)
    revalidatePath('/library')
    return ok({ rated: false })
  }
  const { error } = await d.from('content_ratings').insert({ profile_id: me, content_type: type, content_id: id })
  if (error) return fail(error.message)
  revalidatePath('/library')
  return ok({ rated: true })
}
