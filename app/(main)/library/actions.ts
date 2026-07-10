'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

function db(): SupabaseClient {
  return createAdminClient()
}

// NOTE: Program CREATION is retired (the "Propose a program" form + submitProgram and the
// Adopt/"Run this" action are gone). Existing approved Program rows keep rendering read-only
// in the Library, and reviewContent below still handles the pending 'program' rows a host
// can see at /library/review.

// Submit a practice or journey you own into the Library (→ pending review). It
// stays private to you until a leader approves it (then it goes public).
export async function submitToLibrary(type: 'practice' | 'journey', id: string): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in first.')
  const d = db()
  if (type === 'practice') {
    const { data: row } = await d.from('practices').select('created_by').eq('id', id).maybeSingle()
    if ((row as { created_by?: string } | null)?.created_by !== me) return fail('You can only submit practices you created.')
    const { error } = await d.from('practices').update({ status: 'pending' }).eq('id', id)
    if (error) return fail('Could not submit this practice. Please try again.')
  } else {
    const { data: row } = await d.from('journey_plans').select('author_id').eq('id', id).maybeSingle()
    if ((row as { author_id?: string } | null)?.author_id !== me) return fail('You can only submit journeys you created.')
    const { error } = await d.from('journey_plans').update({ status: 'pending' }).eq('id', id)
    if (error) return fail('Could not submit this journey. Please try again.')
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
