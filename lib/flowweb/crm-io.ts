// FlowWeb leads in the CRM (LIVE-2256): the writes. One root-Space contact per address, one CRM
// conversation per lead, one message per draft step, all through the existing front doors
// (comms conversations spine + the contact timeline mirror). Idempotent: every message is keyed on
// external_message_id, so a repeat post writes nothing new. Frequency never sends any of it.
//
// authz-delegated: the only caller is /api/webhooks/flowweb-crm, which verifies FlowWeb's HMAC signature
// first. Every write is bound to the root Space and the configured owner profile.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'
import { escapeLike } from '@/lib/search-sanitize'
import { appendConversationMessage, openOrGetConversation, updateConversationFields } from '@/lib/comms/conversations'
import { suppress } from '@/lib/suppression'
import { type CrmItem, type LeadStatus, flowwebMeta, leadStatus, nextStatus, planMessages } from '@/lib/flowweb/crm'

interface CrmSyncResult {
  status: 'synced'
  contactId: string
  conversationId: string
  leadStatus: LeadStatus
  signedUp: boolean
  /** Messages this post added; 0 on a repeat. */
  added: number
}

const db = () => createAdminClient()

async function upsertContact(item: CrmItem, rootId: string) {
  const found = await db()
    .from('contacts')
    .select('id, profile_id, meta, consent_state')
    .eq('space_id', rootId)
    .ilike('email', escapeLike(item.email))
    .limit(1)
    .maybeSingle()
  if (found.error) throw new Error(`contact read failed: ${found.error.message}`)
  if (found.data) {
    const meta = (found.data.meta && typeof found.data.meta === 'object' ? found.data.meta : {}) as Record<string, unknown>
    const next = { ...meta, flowweb: flowwebMeta(item, meta.flowweb) }
    const upd = await db().from('contacts').update({ meta: next as Json }).eq('id', found.data.id)
    if (upd.error) throw new Error(`contact update failed: ${upd.error.message}`)
    return { id: String(found.data.id), profileId: found.data.profile_id, consent: found.data.consent_state }
  }
  const ins = await db()
    .from('contacts')
    .insert({
      space_id: rootId,
      email: item.email,
      display_name: item.name ?? item.org,
      source: 'flowweb',
      consent_state: 'unknown',
      meta: { flowweb: flowwebMeta(item, null) } as Json,
    })
    .select('id, profile_id, consent_state')
    .single()
  if (ins.error || !ins.data) throw new Error(`contact insert failed: ${ins.error?.message ?? 'no row'}`)
  return { id: String(ins.data.id), profileId: ins.data.profile_id, consent: ins.data.consent_state }
}

/** True when the lead joined: the contact is linked to a member, or a member's funnel names this draft. */
async function hasSignedUp(profileId: string | null, tag: string): Promise<boolean> {
  if (profileId) return true
  const res = await db().from('profiles').select('id').eq('meta->funnel->>utm_content', tag).limit(1)
  if (res.error) throw new Error(`signup read failed: ${res.error.message}`)
  return (res.data ?? []).length > 0
}

/** The lead's FlowWeb thread, whatever its status, else a new one. */
async function threadFor(item: CrmItem, contactId: string, ownerId: string, rootId: string) {
  const found = await db()
    .from('comms_conversations')
    .select('id, status')
    .eq('kind', 'crm')
    .eq('external_email', item.email)
    .eq('owner_profile_id', ownerId)
    .eq('space_id', rootId)
    .eq('metadata->>source', 'flowweb')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (found.error) throw new Error(`conversation read failed: ${found.error.message}`)
  if (found.data) return { id: String(found.data.id), status: String(found.data.status) }
  const opened = await openOrGetConversation({
    kind: 'crm',
    externalEmail: item.email,
    ownerProfileId: ownerId,
    contactId,
    spaceId: rootId,
    subject: `FlowWeb lead: ${item.org ?? item.name ?? item.email}`.slice(0, 300),
    metadata: { source: 'flowweb', flow: item.flow },
    forceNew: true,
  })
  if (!opened) throw new Error('could not open the conversation')
  return { id: opened.id, status: 'open' }
}

export async function syncFlowwebLead(item: CrmItem, o: { rootId: string; ownerId: string }): Promise<CrmSyncResult> {
  const contact = await upsertContact(item, o.rootId)
  const signedUp = await hasSignedUp(contact.profileId, item.tag)
  const thread = await threadFor(item, contact.id, o.ownerId, o.rootId)

  let added = 0
  for (const m of planMessages(item, signedUp)) {
    const r = await appendConversationMessage({
      conversationId: thread.id,
      direction: m.direction,
      authorKind: m.authorKind,
      authorId: m.authorKind === 'staff' ? o.ownerId : null,
      authorContactId: m.authorKind === 'contact' ? contact.id : null,
      body: m.body,
      isInternal: m.internal,
      externalMessageId: m.key,
      occurredAt: m.at,
      metadata: { source: 'flowweb', step: m.step, tag: item.tag, ...(m.step === 'sent' ? { sent_by: 'founder_mailbox' } : {}) },
      mirror: m.internal
        ? null
        : {
            ownerProfileId: o.ownerId,
            subjectKind: 'contact',
            subjectId: contact.id,
            spaceId: o.rootId,
            subject: m.step === 'sent' ? (item.subject ?? 'FlowWeb note') : 'Reply to a FlowWeb note',
          },
    })
    if (r === null) throw new Error(`could not write the ${m.step} message`)
    if ('id' in r) added++
  }

  if (item.declinedAt) {
    await suppress(item.email, 'flowweb_declined', o.rootId)
    if (contact.consent !== 'unsubscribed')
      await db().from('contacts').update({ consent_state: 'unsubscribed' }).eq('id', contact.id)
  }

  const target = leadStatus(item, signedUp)
  const move = nextStatus(thread.status, target)
  if (move && !(await updateConversationFields(thread.id, { status: move })))
    throw new Error('could not update the conversation status')

  return { status: 'synced', contactId: contact.id, conversationId: thread.id, leadStatus: move ?? (thread.status as LeadStatus), signedUp, added }
}
