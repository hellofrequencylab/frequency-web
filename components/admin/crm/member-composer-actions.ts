'use server'

// Resonance CRM composer — SERVER actions (the send + audience seam for member-composer.tsx).
//
// A compact 1:1 / small-set tool that REUSES the campaign pipeline rather than forking it:
//   • the body is a normal Studio draft (createEmailDraft, phase_id null — a standalone broadcast),
//     edited by the SAME block editor the Beta Campaign uses (EmailEditorPane).
//   • the audience is a set of SegmentKey "chips" (a member, an ad-hoc set, a Circle, an event RSVP
//     list). On send we resolve every chip through resolveSegment (the ONE resolver the campaign send
//     rides), union by profile id, collapse to a single concrete `profiles:<ids>` key, store it on the
//     draft, and hand off to sendNowAction — so consent, suppression, and the per-recipient send-gate
//     all apply EXACTLY as they do for a campaign. We add no queue, no gate, no second send loop.
//
// This is a 'use server' module: the client composer imports only the exported action stubs (RPC), never
// the server-only deps below (admin client / resolveSegment). Voice canon: no em dashes in any copy.

import { createAdminClient } from '@/lib/supabase/admin'
import { approverGate, writerGate } from '@/lib/beta/guard'
import { resolveSegment } from '@/lib/studio/campaigns'
import { sendNowAction } from '@/app/(main)/admin/email-studio/send-actions'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// A hard cap so a composed audience (a Circle plus a set of individuals) can never resolve an unbounded
// list in one send. Matches the spirit of the ad-hoc id cap in lib/studio/campaigns.
const MAX_COMPOSED_RECIPIENTS = 5_000

/** One member search result the composer turns into a removable recipient chip. */
export interface RecipientOption {
  /** The SegmentKey the chip carries (`profile:<id>`). */
  segmentKey: string
  profileId: string
  email: string
  displayName: string
}

/**
 * Resolve a list of audience chips (SegmentKeys) to the DISTINCT profile ids they reach. Each chip is
 * resolved through the shared campaign resolver, so a member added twice, or already inside a chosen
 * Circle / event, is reached exactly once. Best-effort: an unresolvable chip is skipped, never fatal.
 */
async function combineAudience(keys: string[]): Promise<string[]> {
  const profileIds = new Set<string>()
  for (const key of keys) {
    if (!key || typeof key !== 'string') continue
    try {
      const recipients = await resolveSegment(key)
      for (const r of recipients) if (r.profileId) profileIds.add(r.profileId)
    } catch {
      // Skip this chip; the rest of the audience still resolves (fail-safe).
    }
  }
  return [...profileIds].slice(0, MAX_COMPOSED_RECIPIENTS)
}

/**
 * Search members to add as recipients (writer-gated). Matches display name or email on reachable
 * contacts (has a profile, not unsubscribed). Returns up to 8, each as a `profile:<id>` chip. Fail-safe
 * to [] (an ungated caller or a too-short query gets nothing, never the whole list).
 */
export async function searchMemberRecipientsAction(query: string): Promise<RecipientOption[]> {
  const gate = await writerGate()
  if (!gate.ok) return []

  // Strip characters that would break the PostgREST or-filter grammar or the ilike pattern, then require
  // a real search term. This keeps the search from ever resolving to an unbounded match.
  const safe = (query ?? '').replace(/[%_,()\\]/g, ' ').trim()
  if (safe.length < 2) return []
  const like = `%${safe}%`

  const db = createAdminClient()
  const { data } = await db
    .from('contacts')
    .select('id, email, display_name, profile_id, consent_state')
    .not('profile_id', 'is', null)
    .neq('consent_state', 'unsubscribed')
    .or(`display_name.ilike.${like},email.ilike.${like}`)
    .limit(8)

  return (data ?? [])
    .filter((c) => c.profile_id && c.email)
    .map((c) => ({
      segmentKey: `profile:${c.profile_id}`,
      profileId: String(c.profile_id),
      email: String(c.email),
      displayName: (c.display_name as string)?.trim() || String(c.email),
    }))
}

/**
 * Preview how many members the composed audience reaches BEFORE the send (writer-gated). This is the
 * pre-gate membership count; the queued count at send can be lower once each recipient passes the
 * consent + suppression + preference send-gate.
 */
export async function previewMemberAudienceAction(
  audienceKeys: string[],
): Promise<ActionResult<{ count: number }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const combined = await combineAudience(audienceKeys)
  return ok({ count: combined.length })
}

/**
 * Send the composed message now (approver-gated). Resolves the chips to a de-duplicated profile-id set,
 * stores it on the draft as a single `profiles:<ids>` audience, then routes the draft through the
 * existing gated send (sendNowAction -> sendCampaignNow), so the body compiles once and every recipient
 * clears the send-gate before a single email is enqueued. FAIL-SAFE: an empty audience sends to nobody.
 */
export async function sendMemberMessageAction(
  campaignId: string,
  audienceKeys: string[],
): Promise<ActionResult<{ recipientCount: number }>> {
  // Gate the audience write up front; sendNowAction re-checks authorization before the real send.
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)

  const combined = await combineAudience(audienceKeys)
  if (!combined.length) {
    return fail('This message has no one to send to. Add at least one recipient.')
  }

  const segment = `profiles:${combined.join(',')}`
  const db = createAdminClient()
  const { error } = await db.from('campaigns').update({ segment }).eq('id', campaignId)
  if (error) return fail('Could not set the recipients for this message. Try again.')

  // Hand off to the existing gated campaign send with the composed audience now on the row.
  return sendNowAction(campaignId)
}
