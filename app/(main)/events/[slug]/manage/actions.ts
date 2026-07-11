'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  type QuestionType,
} from '@/lib/events/questions'
import { approveRsvp } from '@/lib/events/rsvp-depth'

// Host Manage Dashboard actions (EVENTS-REWORK A2).
//
// Every action runs on the admin client (RLS-bypassing), so it re-checks the
// caller is the event host or a cohost BEFORE mutating — the same posture as
// social-actions.ts. The frozen data layers (lib/events/questions, rsvp-depth)
// only ever WRITE; authorization is entirely this file's job. None of these
// touch the data-layer internals — they call the public helpers only.

const VALID_TYPES: QuestionType[] = [
  'short_text',
  'long_text',
  'dropdown',
  'multi_select',
  'boolean',
  'number',
]

const MAX_PROMPT = 200
const MAX_OPTION = 80
const MAX_OPTIONS = 20

/** Is the caller allowed to manage this event (host or cohost)? Mirrors the page
 *  gate so a direct POST can't bypass it. Returns the caller's profile id when
 *  authorized, else null. */
async function authorizeManager(eventId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return null

  if (ev.host_id === profileId) return profileId
  if (await isEventCohost(eventId, profileId)) return profileId
  return null
}

function revalidateManage(slug: string) {
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath(`/events/${slug}`)
}

/** Parse + sanitize the option list from a newline-or-comma textarea. Only the
 *  choice types keep options; the others store an empty list. */
function parseOptions(raw: string | null, type: QuestionType): string[] {
  if (type !== 'dropdown' && type !== 'multi_select') return []
  if (!raw) return []
  return raw
    .split(/[\n,]/)
    .map((o) => o.trim().slice(0, MAX_OPTION))
    .filter((o) => o.length > 0)
    .slice(0, MAX_OPTIONS)
}

// ── Questionnaire authoring ─────────────────────────────────────────────────

export async function createEventQuestion(eventId: string, slug: string, formData: FormData) {
  if (!(await authorizeManager(eventId))) return

  const prompt = (formData.get('prompt') as string | null)?.trim().slice(0, MAX_PROMPT) ?? ''
  if (!prompt) return

  const typeRaw = (formData.get('type') as string | null) ?? 'short_text'
  const type: QuestionType = VALID_TYPES.includes(typeRaw as QuestionType)
    ? (typeRaw as QuestionType)
    : 'short_text'

  const options = parseOptions(formData.get('options') as string | null, type)
  const required = formData.get('required') === 'on'

  await createQuestion({ eventId, prompt, type, options, required })
  revalidateManage(slug)
}

export async function updateEventQuestion(
  eventId: string,
  slug: string,
  questionId: string,
  formData: FormData,
) {
  if (!(await authorizeManager(eventId))) return

  const prompt = (formData.get('prompt') as string | null)?.trim().slice(0, MAX_PROMPT) ?? ''
  if (!prompt) return

  const typeRaw = (formData.get('type') as string | null) ?? 'short_text'
  const type: QuestionType = VALID_TYPES.includes(typeRaw as QuestionType)
    ? (typeRaw as QuestionType)
    : 'short_text'

  const options = parseOptions(formData.get('options') as string | null, type)
  const required = formData.get('required') === 'on'

  await updateQuestion(questionId, eventId, { prompt, type, options, required })
  revalidateManage(slug)
}

export async function deleteEventQuestion(eventId: string, slug: string, questionId: string) {
  if (!(await authorizeManager(eventId))) return
  await deleteQuestion(questionId, eventId)
  revalidateManage(slug)
}

// ── Approval queue ──────────────────────────────────────────────────────────

export async function approveEventRsvpFromManage(
  eventId: string,
  slug: string,
  guestProfileId: string,
) {
  if (!(await authorizeManager(eventId))) return
  await approveRsvp(eventId, guestProfileId)
  revalidateManage(slug)
}

// ── Follow up (buying-intent) ─────────────────────────────────────────────────

/** Open (or start) a direct thread from the host to a follow-up member, then land
 *  in it. Uses the UNGATED findOrCreateDirectConversation — NOT startConversation,
 *  which is friendship-gated and would refuse a host reaching a buyer they aren't
 *  friends with. Authorizes the caller as host/cohost first; the returned id is the
 *  host's own profile id, which is our side of the DM. */
export async function openFollowUpDm(eventId: string, memberProfileId: string) {
  const hostProfileId = await authorizeManager(eventId)
  if (!hostProfileId || hostProfileId === memberProfileId) return

  const admin = createAdminClient()
  const conversationId = await findOrCreateDirectConversation(
    // findOrCreateDirectConversation takes a plain SupabaseClient (it reads/writes
    // conversations + conversation_participants); widen this ONE arg (ADR-246 exception).
    // eslint-disable-next-line no-restricted-syntax -- helper takes an untyped SupabaseClient (ADR-246 exception)
    admin as unknown as SupabaseClient,
    hostProfileId,
    memberProfileId,
  )
  // redirect throws, so it sits outside any try/catch (Next server-action rule).
  redirect(`/messages/${conversationId}`)
}
