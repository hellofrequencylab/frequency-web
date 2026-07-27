// The BULK operator-DM loop (ADR-827 ruling 4): one spine conversation + one in-app message per
// recipient, shared by every broadcast surface (event Manage, Journey launch, the Space lane).
// Extracted from the event/journey copies so the cap, the abuse buckets, the per-recipient block
// check, and the email-keyed threading stay IDENTICAL across lanes instead of drifting copy by
// copy. Policy the callers still own: WHO is in the audience (each surface's gate + segment
// resolution runs before this), and the empty-audience refusal (its wording names the surface's
// audience rule).

import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk } from '@/lib/rate-limit'
import { isBlockedBetween } from '@/lib/blocking'
import { openOrGetConversation, appendConversationMessage } from '@/lib/comms/conversations'

/** Direct Messages write 2+ rows per recipient in one request, so the blast is bounded.
 *  Refuse-first past the cap: the composer points the sender at a list-scale channel instead. */
export const DM_BLAST_CAP = 300

/** One resolved recipient: display name + auth email (the spine threads by counterpart address,
 *  so a member with no address cannot be threaded). */
export interface BulkDmRecipient {
  displayName: string
  email: string | null
}

/** display name + auth email per recipient (the Event Dispatch email lane's shape: profiles ->
 *  auth record, lib/events/dispatch.ts fanOutEventEmail). Best-effort per row. */
export async function resolveDmRecipients(
  profileIds: string[],
): Promise<Map<string, BulkDmRecipient>> {
  const out = new Map<string, BulkDmRecipient>()
  if (profileIds.length === 0) return out
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, auth_user_id')
    .in('id', profileIds)
  const rows = (data ?? []) as { id: string; display_name: string | null; auth_user_id: string | null }[]
  for (const p of rows) {
    let email: string | null = null
    if (p.auth_user_id) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(p.auth_user_id)
        email = u?.user?.email?.trim().toLowerCase() ?? null
      } catch {
        email = null
      }
    }
    out.set(p.id, { displayName: p.display_name ?? 'there', email })
  }
  return out
}

export interface BulkDmInput {
  actorId: string
  recipientProfileIds: string[]
  subject: string
  body: string
  spaceId?: string | null
  scope?: { kind: 'event' | 'circle' | 'hub' | 'nexus' | 'journey'; id: string } | null
  /** Rate-limit bucket prefix, e.g. 'event-broadcast' | 'journey-broadcast' | 'space-broadcast'. */
  bucket: string
  /** The surface's thread/touch stamp (each lane's legacy metadata dual-write, ADR-831). */
  metadata?: Record<string, unknown>
  /** Counterpart emails the caller already resolved (the event surface resolves once for its
   *  email + DM channels); resolved here via resolveDmRecipients when absent. */
  recipients?: Map<string, BulkDmRecipient>
  /** Stamp the scope onto the CRM mirror too. The event lane does (ADR-831); the journey lane's
   *  mirror shipped unscoped and stays that way until its read side migrates. */
  scopeOnMirror?: boolean
  /** Skips the caller already counted before handing over the list (e.g. picked segment members
   *  outside the DM audience), folded into `skipped` and the detail line. */
  presetSkipped?: number
  /** The parenthetical skip reason on the delivered detail line. */
  skippedReason?: string
  /** The alternative the over-cap refusal names (each surface has its own list-scale channel). */
  capAlternative?: string
}

export interface BulkDmResult {
  sent: number
  skipped: number
  detail: string
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

/**
 * Send one composed Direct Message to each recipient over the comms spine: an in-app CRM
 * conversation per recipient (kind 'crm', channel 'in_app') in the caller's scope lane, plus the
 * CRM timeline mirror. Refusals (over-cap, rate-limited) return sent 0 with the refusal as
 * `detail`, so callers map ok = sent > 0 and surface `detail` unchanged.
 */
export async function sendBulkDm(input: BulkDmInput): Promise<BulkDmResult> {
  const { actorId, body } = input
  const eligible = input.recipientProfileIds

  if (eligible.length > DM_BLAST_CAP) {
    return {
      sent: 0,
      skipped: 0,
      detail: `That is too many people for Direct Messages (limit ${DM_BLAST_CAP}).${
        input.capAlternative ? ` ${input.capAlternative}` : ''
      }`,
    }
  }

  // Shared abuse buckets (the scoped-DM lane's per-minute token, drawn once per blast, plus a
  // per-surface broadcast bucket so a sender cannot loop blasts). Fail-closed in production when
  // unconfigured (lib/rate-limit).
  if (!(await rateLimitOk(`${input.bucket}:dm`, actorId, 10, '1 h'))) {
    return { sent: 0, skipped: 0, detail: 'You have sent a lot of messages recently. Try again in a bit.' }
  }
  if (!(await rateLimitOk('scoped-dm:msg', actorId, 20, '1 m'))) {
    return { sent: 0, skipped: 0, detail: 'Slow down a little. Try again in a minute.' }
  }

  const recipients = input.recipients ?? (await resolveDmRecipients(eligible))
  const scope = input.scope ?? null
  let sent = 0
  let skipped = input.presetSkipped ?? 0
  for (const profileId of eligible) {
    try {
      // Block gate, both directions, per recipient (parity with openScopedDm).
      if (await isBlockedBetween(actorId, profileId)) {
        skipped++
        continue
      }
      const email = recipients.get(profileId)?.email
      if (!email) {
        skipped++ // the spine threads by counterpart address; no address, no thread.
        continue
      }
      // The spine, scoped: an in-app CRM conversation in THIS lane (a scoped thread never absorbs
      // an unrelated exchange with the same person, ADR-831).
      const conv = await openOrGetConversation({
        kind: 'crm',
        channel: 'in_app',
        externalEmail: email,
        ownerProfileId: actorId,
        subject: input.subject,
        memberProfileId: profileId,
        spaceId: input.spaceId ?? null,
        scopeKind: scope?.kind ?? null,
        scopeId: scope?.id ?? null,
        metadata: input.metadata,
      })
      if (!conv) {
        skipped++
        continue
      }
      const appended = await appendConversationMessage({
        conversationId: conv.id,
        direction: 'outbound',
        authorKind: 'leader',
        authorId: actorId,
        channel: 'in_app',
        body,
        mirror: {
          ownerProfileId: actorId,
          subjectKind: 'profile',
          subjectId: profileId,
          spaceId: input.spaceId ?? null,
          subject: input.subject,
          ...(input.scopeOnMirror && scope ? { scope } : {}),
        },
      })
      if (appended && 'id' in appended) sent++
      else skipped++
    } catch {
      skipped++
    }
  }

  let detail = `Delivered to ${people(sent)} in their Frequency inbox.`
  if (skipped > 0) detail += ` ${skipped} skipped (${input.skippedReason ?? 'blocked or unreachable'}).`
  return { sent, skipped, detail }
}
