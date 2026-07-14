'use server'

// Manual "log a touch" server action for the admin contact card (ADR-372 Phase 1 · Adapter C). Writes a
// call / meeting / note NATIVELY onto the ONE interaction timeline (contact_interactions) with
// source 'manual', so a hand-logged touch always shows and is never hidden by the system/human toggle.
// Staff-gated (marketing) + scoped to the single contact id. Fail-safe reporting: returns { ok } so the
// client stops showing a false success on a write miss. Mirrors app/(main)/admin/marketing/contacts/
// actions.ts addContactNote (its natural sibling; kept here so it lives in a file this change owns).

import { revalidatePath } from 'next/cache'
import { requireStaffCap } from '@/lib/staff'
import { recordContactInteraction, type InteractionChannel } from '@/lib/crm/interactions'

/** The kinds of touch an operator can log by hand. Maps 1:1 to a timeline channel. */
export type ManualTouchKind = 'call' | 'meeting' | 'note'

const KIND_TO_CHANNEL: Record<ManualTouchKind, InteractionChannel> = {
  call: 'call',
  meeting: 'in_person',
  note: 'note',
}

// A logged call/meeting is a touch you made (outbound); a note is an internal record (no direction).
const KIND_TO_DIRECTION: Record<ManualTouchKind, 'outbound' | 'internal'> = {
  call: 'outbound',
  meeting: 'outbound',
  note: 'internal',
}

const KIND_TO_SUMMARY: Record<ManualTouchKind, string> = {
  call: 'Logged a call',
  meeting: 'Logged a meeting',
  note: 'Note',
}

/**
 * Log a call / meeting / note against a contact's timeline. Staff-gated; the write is stamped with the
 * acting operator as owner and scoped to the one contact subject. `note` is optional context; a call or
 * meeting can be logged with no note. Returns { ok:false } on an unknown kind or a write miss.
 */
export async function logManualTouch(
  contactId: string,
  kind: ManualTouchKind,
  note?: string,
): Promise<{ ok: boolean }> {
  const me = await requireStaffCap('marketing')
  if (!contactId || !(kind in KIND_TO_CHANNEL)) return { ok: false }

  const body = (note ?? '').trim().slice(0, 5000) || null
  const res = await recordContactInteraction({
    ownerProfileId: me.profileId,
    subjectKind: 'contact',
    subjectId: contactId,
    channel: KIND_TO_CHANNEL[kind],
    direction: KIND_TO_DIRECTION[kind],
    summary: KIND_TO_SUMMARY[kind],
    body,
    source: 'manual',
  })

  revalidatePath(`/admin/marketing/contacts/${contactId}`)
  return { ok: !!res }
}
