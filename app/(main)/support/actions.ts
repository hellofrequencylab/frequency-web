'use server'

// Member support actions (ADR-159): file a ticket (with page context + an optional
// screenshot) and reply to your own tickets. Screenshots upload to the private
// `support` bucket; everything else is plain ticket data.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createTicket, addMemberMessage, uploadScreenshot } from '@/lib/support/store'
import { TICKET_TYPES, type SupportContext, type TicketType } from '@/lib/support/types'

function parseType(v: unknown): TicketType {
  return TICKET_TYPES.includes(v as TicketType) ? (v as TicketType) : 'bug'
}

/** Create a support ticket from the report dialog. Carries the page/activity context
 *  JSON and an optional screenshot file in the FormData. */
export async function createSupportTicket(
  formData: FormData,
): Promise<ActionResult<{ id: string; ref: number }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in to send a report.')

  const subject = String(formData.get('subject') ?? '').trim()
  if (!subject) return fail('Add a short summary of the issue.')
  const body = String(formData.get('body') ?? '').trim()
  const type = parseType(formData.get('type'))
  const pageUrl = String(formData.get('pageUrl') ?? '').trim() || null

  let context: SupportContext = {}
  try {
    const raw = formData.get('context')
    if (typeof raw === 'string' && raw) context = JSON.parse(raw) as SupportContext
  } catch {
    context = {}
  }

  let screenshotPath: string | null = null
  const file = formData.get('screenshot')
  if (file instanceof File && file.size > 0) {
    try {
      screenshotPath = await uploadScreenshot(me.id, file)
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Could not attach the screenshot.')
    }
  }

  try {
    const res = await createTicket({ profileId: me.id, type, subject, body, pageUrl, context, screenshotPath })
    revalidatePath('/support')
    return ok(res)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not send your report.')
  }
}

/** Member reply on their own ticket. */
export async function replyToTicket(ticketId: string, body: string): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')
  if (!body.trim()) return fail('Write a reply first.')
  const okReply = await addMemberMessage(ticketId, me.id, body)
  if (!okReply) return fail('That isn’t your ticket.')
  revalidatePath(`/support/${ticketId}`)
  revalidatePath('/support')
  return ok()
}
