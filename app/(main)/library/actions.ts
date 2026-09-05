'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { canReviewLibrarySubmission } from '@/lib/moderation/scope'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

function db(): SupabaseClient {
  return createAdminClient()
}

// Submit a practice or journey you own into the Library (→ pending review). It
// stays private to you until a leader approves it (then it goes public).
export async function submitToLibrary(type: 'practice' | 'journey', id: string): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in first.')
  const d = db()
  if (type === 'practice') {
    // The public practice library is the paid surface (ADR-920 review): the same
    // practice.create gate the other two submit paths enforce, so this older path
    // cannot route around the Crew wall.
    const { canCreate } = await import('@/lib/core/load-capabilities')
    if (!(await canCreate('practice.create'))) return fail('Publishing to the library comes with Crew.')
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
//
// 🔴 The first line above is what this gate USED to admit, and it was the defect (L7-3). `host`
// is self-granted (publishing a Circle runs `ensureHostOnOwnership`), and a Library submission has
// no circle to scope a host to, so "Host or Guide+" meant any member who had published a circle
// could publish or reject anyone's practice or journey platform-wide, through a client that
// bypasses RLS. `practices` and `journey_plans` carry no UPDATE policy at all, so this line is the
// only gate there is. Review is now platform staff (web_role admin/janitor, ADR-208) via
// `canReviewLibrarySubmission` (lib/moderation/scope.ts). The queue page and block still show to
// Host+; a host who clicks Approve gets the refusal below rather than a silent publish.
export async function reviewContent(
  type: ContentType,
  id: string,
  decision: 'approve' | 'reject',
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller || !canReviewLibrarySubmission(caller.webRole)) {
    return fail('Only platform staff can review Library submissions.')
  }
  const d = db()
  const approved = decision === 'approve'
  const review = { status: approved ? 'approved' : 'rejected', reviewed_by: caller.id, reviewed_at: new Date().toISOString() }

  if (type === 'practice') {
    await d.from('practices').update({ ...review, ...(approved ? { is_public: true } : {}) }).eq('id', id)
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
