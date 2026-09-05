'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'
import { viewerActsAsEventHost } from '@/lib/events/host-gate'
import { loadEventCrmAccess } from '@/lib/events/crm-access'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import { dmThreadHref } from '@/lib/messages/dm-destination'
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  type QuestionType,
} from '@/lib/events/questions'
import { approveRsvpById } from '@/lib/events/rsvp-depth'
import { sendRsvpApprovedNotice } from '@/lib/events/guest-rsvp-email'

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

/** Is the caller allowed to manage this event (host, platform staff, or cohost)? Mirrors
 *  the page gate so a direct POST can't bypass it. Host authority resolves through the
 *  shared host-gate seam (lib/events/host-gate, ADR-841), so an operator passes on any
 *  event, including a hostless seeded listing. Returns the caller's profile id when
 *  authorized, else null. */
async function authorizeManager(eventId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  if (await viewerActsAsEventHost(eventId, profileId)) return profileId
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

/** Approves BY RSVP ROW rather than by profile. A signed-out guest has no profile id, so the
 *  old `approveRsvp(eventId, profileId)` predicate (`profile_id = NULL`) matched nothing and the
 *  host's Approve button was inert for exactly the requests that most needed it. The event id is
 *  still matched inside approveRsvpById, so a row id from another event cannot be approved here. */
export async function approveEventRsvpFromManage(
  eventId: string,
  slug: string,
  rsvpId: string,
) {
  if (!(await authorizeManager(eventId))) return
  // 2026-09-05 (scan2 L5-10): the approve write's result is read, and a refused or unmatched
  // write sends no notice; "you're in" on top of a row still marked pending is the trap in reverse.
  const approved = await approveRsvpById(eventId, rsvpId)
  if (!approved.ok) return
  // Tell them. Without this the gate is a trap: they asked, were told to wait, and nothing ever
  // arrives — a member would find out by reopening the page on the off chance, and a guest, who has
  // no account to reopen anything with, would never find out at all.
  await sendRsvpApprovedNotice(eventId, rsvpId).catch(() => {})
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

  // The access-tier seam (ADR-836): a personal-tier viewer's DM paths lock once the event
  // ends (re-invite only). Mirrors the Message Attendees action; the section hides the
  // button in the same state, so this server check is the backstop.
  const access = await loadEventCrmAccess(eventId)
  if (!access.canMessage) return

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
  // Flag-aware destination (ADR-896): with the DM route retired this lands the operator in
  // the chat dock in ONE hop instead of bouncing off a redirecting page. Flag off (today's
  // default) it returns the identical /messages/<id> string this line used to hardcode.
  redirect(await dmThreadHref(conversationId))
}
