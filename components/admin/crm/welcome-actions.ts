'use server'

// THE PERSONAL WELCOME ACTIONS (LIVE-2340). The Resonance CRM roster's welcome glow opens the member composer on a
// pre-filled welcome draft; these are the three server steps behind it. Nothing here sends on its own: the send is a
// staff member pressing Send, and it rides the SAME gated 1:1 send the Message Member composer uses
// (sendMemberMessageAction -> sendNowAction), so consent, suppression and the per-recipient send gate all apply.
//
//   • startWelcomeDraftAction  — writer-gated. Resumes this staff member's unsent welcome draft for the member, or
//     creates one: subject + an editable heading and paragraph in Daniel's voice (lib/crm/welcome.ts).
//   • sendWelcomeAction        — approver-gated. Sends to that ONE member, then records the welcome so the glow clears.
//   • markWelcomedAction       — approver-gated. Records a welcome sent some other way, with no email.
//
// Voice canon: no em dashes in any copy.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { approverGate, writerGate } from '@/lib/outbound/guard'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { prepareEmailLayoutWrite } from '@/lib/email-studio/layout-write'
import { firstNameOf, welcomeDraftLayout, welcomeSubject } from '@/lib/crm/welcome'
import { recordWelcome } from '@/lib/crm/welcome-io'
import { sendMemberMessageAction } from './member-composer-actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The welcome draft's audience marker: the member's own one-person segment, set at creation so a reopen finds it. */
const welcomeSegment = (profileId: string) => `profiles:${profileId}`

function revalidateRosters() {
  revalidatePath('/admin/crm')
  revalidatePath('/admin/crm/members')
}

/** Resume or create the welcome draft for a member. Returns the campaign id the composer edits. */
export async function startWelcomeDraftAction(profileId: string): Promise<ActionResult<{ id: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  if (!UUID.test(profileId)) return fail('That member could not be found.')

  const db = createAdminClient()
  const segment = welcomeSegment(profileId)

  // One welcome draft per staff member per member: reopening the glow resumes it, edits and all.
  const { data: existing } = await db
    .from('campaigns')
    .select('id')
    .eq('created_by', gate.profileId)
    .eq('status', 'draft')
    .eq('segment', segment)
    .is('sent_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const resumable = (existing as { id: string }[] | null)?.[0]
  if (resumable) return ok({ id: resumable.id })

  const { data: people } = await db.from('profiles').select('id, display_name, handle').in('id', [profileId, gate.profileId])
  const rows = (people as { id: string; display_name: string | null; handle: string | null }[] | null) ?? []
  const member = rows.find((r) => r.id === profileId)
  if (!member) return fail('That member could not be found.')
  const sender = rows.find((r) => r.id === gate.profileId)
  const memberFirst = firstNameOf(member.display_name, member.handle)
  const senderFirst = firstNameOf(sender?.display_name, sender?.handle)

  const draft = welcomeDraftLayout(memberFirst, senderFirst)
  const write = await prepareEmailLayoutWrite(draft, null, () => draft)
  if (!('layout' in write) || !write.layout) return fail('Could not start the welcome. Try again.')
  const layout = write.layout

  const { data, error } = await db
    .from('campaigns')
    .insert({
      block_json: layout as unknown as never,
      body: '',
      subject: welcomeSubject(memberFirst),
      preheader: 'A quick hello from a real person at Frequency.',
      status: 'draft',
      created_by: gate.profileId,
      segment,
      // A 1:1 message is a reply-able conversation (ADR-812), like every Message Member draft.
      reply_mode: 'conversation',
    } as unknown as Database['public']['Tables']['campaigns']['Insert'])
    .select('id')
    .single()
  if (error || !data) return fail('Could not start the welcome. Try again.')
  return ok({ id: (data as { id: string }).id })
}

/** Send the welcome to that one member, then record it so their glow clears. The audience is pinned to the member:
 *  whatever the composer passes, only `profile:<id>` goes out. */
export async function sendWelcomeAction(
  campaignId: string,
  profileId: string,
): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  if (!UUID.test(profileId) || !UUID.test(campaignId)) return fail('That welcome could not be found.')

  const res = await sendMemberMessageAction(campaignId, [`profile:${profileId}`])
  if (isError(res)) return res
  // Recorded only when the email actually went to them. A member who opted out stays un-welcomed (and the pop-up
  // says nobody was reached), so the glow keeps telling the truth.
  if (res.data.recipientCount > 0) {
    await recordWelcome({ profileId, sent: true })
    revalidateRosters()
  }
  return res
}

/** Record a welcome that happened some other way (a text, a hello in person). Clears the glow, sends nothing. */
export async function markWelcomedAction(profileId: string): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  if (!UUID.test(profileId)) return fail('That member could not be found.')
  const saved = await recordWelcome({ profileId, sent: false })
  if (!saved) return fail('Could not save that. Try again.')
  revalidateRosters()
  return ok()
}
