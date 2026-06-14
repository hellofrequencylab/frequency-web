import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Event questionnaire data layer (EVENTS-REWORK A1) — host-defined questions and
// guest answers. RLS (20260625030000) gates access: questions are readable by
// anyone who can read the event; answers are readable only by the author and the
// host/cohost. These admin-client helpers bypass RLS, so callers MUST authorize
// the actor first (host/cohost for question CRUD + answer-roster reads; the author
// for their own answer). New tables aren't in lib/database.types.ts yet → untyped
// client, the established convention (see event_ticket_types / cohosts).

function untyped(): SupabaseClient {
  return createAdminClient()
}

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

interface QuestionRow {
  id: string
  event_id: string
  prompt: string
  type: QuestionType
  options: string[] | null
  required: boolean
  position: number
}

function toQuestion(r: QuestionRow): EventQuestion {
  return {
    id: r.id,
    eventId: r.event_id,
    prompt: r.prompt,
    type: r.type,
    options: Array.isArray(r.options) ? r.options : [],
    required: r.required,
    position: r.position,
  }
}

/** The questionnaire for an event, in display order. */
export async function listQuestions(eventId: string): Promise<EventQuestion[]> {
  const admin = untyped()
  const { data } = await admin
    .from('event_questions')
    .select('id, event_id, prompt, type, options, required, position')
    .eq('event_id', eventId)
    .order('position', { ascending: true })
  return ((data ?? []) as unknown as QuestionRow[]).map(toQuestion)
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
  const admin = untyped()

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
  return toQuestion(data as unknown as QuestionRow)
}

/** Edit a question. Caller must already be authorized as host/cohost. */
export async function updateQuestion(
  questionId: string,
  patch: Partial<Pick<EventQuestion, 'prompt' | 'type' | 'options' | 'required' | 'position'>>,
): Promise<void> {
  const admin = untyped()
  const update: Record<string, unknown> = {}
  if (patch.prompt !== undefined) update.prompt = patch.prompt.trim()
  if (patch.type !== undefined) update.type = patch.type
  if (patch.options !== undefined) update.options = patch.options
  if (patch.required !== undefined) update.required = patch.required
  if (patch.position !== undefined) update.position = patch.position
  if (Object.keys(update).length === 0) return
  await admin.from('event_questions').update(update).eq('id', questionId)
}

/** Remove a question (cascades its answers). Caller must be host/cohost. */
export async function deleteQuestion(questionId: string): Promise<void> {
  const admin = untyped()
  await admin.from('event_questions').delete().eq('id', questionId)
}

/** Upsert the caller's own answer to a question (one per question+profile).
 *  Caller must be the author (and able to read the event). */
export async function setAnswer(args: {
  questionId: string
  eventId: string
  profileId: string
  answer: string
}): Promise<void> {
  const admin = untyped()
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
  const admin = untyped()
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
  const admin = untyped()
  const { data } = await admin
    .from('event_question_answers')
    .select('id, question_id, event_id, profile_id, answer')
    .eq('event_id', eventId)
  return toAnswers(data)
}

interface AnswerRow {
  id: string
  question_id: string
  event_id: string
  profile_id: string
  answer: string
}

function toAnswers(data: unknown): EventQuestionAnswer[] {
  return ((data ?? []) as unknown as AnswerRow[]).map((r) => ({
    id: r.id,
    questionId: r.question_id,
    eventId: r.event_id,
    profileId: r.profile_id,
    answer: r.answer,
  }))
}
