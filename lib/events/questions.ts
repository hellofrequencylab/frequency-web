import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

// Event questionnaire data layer (EVENTS-REWORK A1) — host-defined questions and
// guest answers. RLS (20260625030000) gates access: questions are readable by
// anyone who can read the event; answers are readable only by the author and the
// host/cohost. These admin-client helpers bypass RLS, so callers MUST authorize
// the actor first (host/cohost for question CRUD + answer-roster reads; the author
// for their own answer). The events tables are in lib/database.types.ts now, so the
// admin client is fully typed (ADR-280 follow-up — the untyped() escape hatch is gone).

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'dropdown'
  | 'multi_select'
  | 'boolean'
  | 'number'

export interface EventQuestion {
  id: string
  eventId: string
  prompt: string
  type: QuestionType
  options: string[]
  required: boolean
  position: number
}

export interface EventQuestionAnswer {
  id: string
  questionId: string
  eventId: string
  profileId: string
  answer: string
}

// The exact column projection these helpers read (a subset of the generated Row).
type QuestionRow = Pick<
  Database['public']['Tables']['event_questions']['Row'],
  'id' | 'event_id' | 'prompt' | 'type' | 'options' | 'required' | 'position'
>

function toQuestion(r: QuestionRow): EventQuestion {
  return {
    id: r.id,
    eventId: r.event_id,
    prompt: r.prompt,
    // `type` is a free-text column at the DB layer; the app constrains it to QuestionType.
    type: r.type as QuestionType,
    // `options` is jsonb; it always holds a string[] when set (see createQuestion).
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
    required: r.required,
    position: r.position,
  }
}

/** The questionnaire for an event, in display order. */
export async function listQuestions(eventId: string): Promise<EventQuestion[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_questions')
    .select('id, event_id, prompt, type, options, required, position')
    .eq('event_id', eventId)
    .order('position', { ascending: true })
  return (data ?? []).map(toQuestion)
}

/** Add a question. Caller must already be authorized as host/cohost of the event.
 *  position defaults to the end of the current list. */
export async function createQuestion(args: {
  eventId: string
  prompt: string
  type?: QuestionType
  options?: string[]
  required?: boolean
  position?: number
}): Promise<EventQuestion | null> {
  const admin = createAdminClient()

  let position = args.position
  if (position == null) {
    const { count } = await admin
      .from('event_questions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', args.eventId)
    position = count ?? 0
  }

  const { data, error } = await admin
    .from('event_questions')
    .insert({
      event_id: args.eventId,
      prompt: args.prompt.trim(),
      type: args.type ?? 'short_text',
      options: args.options ?? [],
      required: args.required ?? false,
      position,
    })
    .select('id, event_id, prompt, type, options, required, position')
    .maybeSingle()

  if (error || !data) return null
  return toQuestion(data)
}

/** Edit a question. Caller must already be authorized as host/cohost. */
export async function updateQuestion(
  questionId: string,
  eventId: string,
  patch: Partial<Pick<EventQuestion, 'prompt' | 'type' | 'options' | 'required' | 'position'>>,
): Promise<void> {
  const admin = createAdminClient()
  const update: Database['public']['Tables']['event_questions']['Update'] = {}
  if (patch.prompt !== undefined) update.prompt = patch.prompt.trim()
  if (patch.type !== undefined) update.type = patch.type
  if (patch.options !== undefined) update.options = patch.options
  if (patch.required !== undefined) update.required = patch.required
  if (patch.position !== undefined) update.position = patch.position
  if (Object.keys(update).length === 0) return
  // Scope to the authorized event so a host can't edit another event's questions by id (ADR-274).
  await admin.from('event_questions').update(update).eq('id', questionId).eq('event_id', eventId)
}

/** Remove a question (cascades its answers). Caller must be host/cohost. */
export async function deleteQuestion(questionId: string, eventId: string): Promise<void> {
  const admin = createAdminClient()
  // Scope to the authorized event (prevents cross-event delete-by-id, cascading answers; ADR-274).
  await admin.from('event_questions').delete().eq('id', questionId).eq('event_id', eventId)
}

/** Upsert the caller's own answer to a question (one per question+profile).
 *  Caller must be the author (and able to read the event). */
export async function setAnswer(args: {
  questionId: string
  eventId: string
  profileId: string
  answer: string
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('event_question_answers').upsert(
    {
      question_id: args.questionId,
      event_id: args.eventId,
      profile_id: args.profileId,
      answer: args.answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'question_id,profile_id' },
  )
}

/** A guest's own answers to an event's questions (for prefilling the form). */
export async function listMyAnswers(
  eventId: string,
  profileId: string,
): Promise<EventQuestionAnswer[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_question_answers')
    .select('id, question_id, event_id, profile_id, answer')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
  return toAnswers(data)
}

/** The full answer roster for an event (host/cohost only — authorize first).
 *  Powers the Host Manage Dashboard's questionnaire view / CSV export. */
export async function listEventAnswers(eventId: string): Promise<EventQuestionAnswer[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_question_answers')
    .select('id, question_id, event_id, profile_id, answer')
    .eq('event_id', eventId)
  return toAnswers(data)
}

type AnswerRow = Pick<
  Database['public']['Tables']['event_question_answers']['Row'],
  'id' | 'question_id' | 'event_id' | 'profile_id' | 'answer'
>

function toAnswers(data: AnswerRow[] | null): EventQuestionAnswer[] {
  return (data ?? []).map((r) => ({
    id: r.id,
    questionId: r.question_id,
    eventId: r.event_id,
    profileId: r.profile_id,
    answer: r.answer,
  }))
}
