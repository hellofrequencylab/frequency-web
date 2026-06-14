'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import {
  listQuestions,
  listMyAnswers,
  setAnswer,
  type EventQuestion,
} from '@/lib/events/questions'

// Guest-facing questionnaire actions (EVENTS-REWORK A1). The RSVP control surfaces
// the host's questions at RSVP time and saves the guest's answers. Self-authorized:
// a guest may only read/write their OWN answers, and only for an event they can see.
// These call the frozen lib/events/questions helpers (which only ever write); the
// authorization is this file's job, mirroring social-actions.ts.

export interface GuestQuestionnaire {
  questions: EventQuestion[]
  /** the caller's saved answers, keyed by question id */
  answers: Record<string, string>
}

/** The questions for an event plus the caller's own current answers (prefill).
 *  Returns an empty questionnaire for a signed-out viewer. */
export async function loadGuestQuestionnaire(eventId: string): Promise<GuestQuestionnaire> {
  const profileId = await getMyProfileId()
  if (!profileId) return { questions: [], answers: {} }

  // Only surface questions for an event the caller can actually read. We re-derive
  // visibility the same way the Invite does (admin client bypasses RLS).
  if (!(await canViewEvent(eventId, profileId))) return { questions: [], answers: {} }

  const [questions, mine] = await Promise.all([
    listQuestions(eventId),
    listMyAnswers(eventId, profileId),
  ])
  const answers: Record<string, string> = {}
  for (const a of mine) answers[a.questionId] = a.answer
  return { questions, answers }
}

/** Save the caller's answer to one question. No-ops for an unauthorized caller or a
 *  question that doesn't belong to the event. */
export async function saveGuestAnswer(
  eventId: string,
  slug: string,
  questionId: string,
  answer: string,
): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) return
  if (!(await canViewEvent(eventId, profileId))) return

  // Defense in depth: confirm the question really belongs to this event before
  // writing (the upsert keys on question_id + profile_id). event_questions isn't in
  // the generated types yet → untyped client, the established convention.
  // eslint-disable-next-line no-restricted-syntax -- event_questions not in generated types yet (ADR-246 exception)
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: q } = await admin
    .from('event_questions')
    .select('id')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!q) return

  await setAnswer({ questionId, eventId, profileId, answer: answer.slice(0, 2000) })
  if (slug) revalidatePath(`/events/${slug}`)
}

// Mirror the Invite's visibility gate: public/unlisted are readable; private is
// host/manager-only; circle_only needs active membership of the hosting circle.
// The host always passes.
async function canViewEvent(eventId: string, profileId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('host_id, visibility, scope_type, scope_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return false
  if (ev.host_id === profileId) return true

  const vis = ev.visibility ?? 'circle_only'
  if (vis === 'public' || vis === 'unlisted') return true
  if (vis === 'private') return false
  // circle_only: require active membership of the hosting circle.
  if (ev.scope_type === 'circle' && ev.scope_id) {
    const { data: member } = await admin
      .from('memberships')
      .select('id')
      .eq('profile_id', profileId)
      .eq('circle_id', ev.scope_id)
      .eq('status', 'active')
      .maybeSingle()
    return !!member
  }
  return false
}
