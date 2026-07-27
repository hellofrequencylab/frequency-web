'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { rateLimitOk } from '@/lib/rate-limit'
import { sendSpaceCampaignSystem } from '@/lib/spaces/email'
import { renderCampaignHtml } from '@/lib/spaces/campaigns'
import { composeSpaceDispatch } from '@/lib/spaces/dispatch'
import { sendBulkDm } from '@/lib/comms/bulk-dm'
import {
  resolveSpaceBroadcastAudience,
  scopeForSelection,
} from '@/lib/spaces/broadcast-audience'
import type {
  BroadcastChannelKey,
  BroadcastChannelResult,
  BroadcastSendInput,
} from '@/components/comms/broadcast-types'

// THE SPACE MESSAGE CENTER's send action (ADR-858): one submit, up to four delivery lanes,
// each reporting its own honest result. A structural port of the event broadcast action
// (app/(main)/events/[slug]/manage/broadcast-actions.ts) with the gate swapped to
// space-manage and the audience swapped to the Space's segments (members / tiers /
// circles / event RSVPs — lib/spaces/broadcast-audience.ts).
//
// The audience is ALWAYS re-resolved server-side from segment keys (ADR-274); the client's
// profileIds exist only for the live count. Channel lanes:
//   email    — the Space's own campaigns machinery, so every anti-spam gate applies
//              (kill switch, daily cap, consent, topic mutes, suppression, unsubscribe).
//   dm       — the shared bulk-DM helper over the comms spine (block-gated, capped).
//   dispatch — a Space Dispatch (audience_scope 'space'): rail + digest + member push.
//   sms      — refuse-first until A2P provisioning lands (ADR-256).

const MAX_SUBJECT = 200
const MAX_BODY = 5000
const CHANNEL_ORDER: readonly BroadcastChannelKey[] = ['email', 'dm', 'dispatch', 'sms']

interface ManagedSpace {
  id: string
  slug: string
  name: string
}

/** Resolve the Space by slug and require manage access (the same door the Conversations
 *  console uses). Staff PREVIEW is read-only there and stays read-only here: previewing
 *  staff can see the console but sends require canManage. Fail-closed on any miss. */
async function resolveManagedSpace(slug: string): Promise<{ space: ManagedSpace; actorId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const { canManage } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  if (!canManage) return null
  const name = (space as { brand_name?: string | null; name?: string | null }).brand_name
    ?? (space as { name?: string | null }).name
    ?? 'Your space'
  return { space: { id: space.id, slug, name }, actorId: caller.id }
}

/** The Space CONTACTS inside the audience, by profile_id — the ONLY people this lane may
 *  email (ADR-863). A member's auth-account email is delivery data they never gave the
 *  Space (ADR-854); reading it via the Auth admin API and feeding it to the campaign lane
 *  both disclosed private addresses into the operator-visible send ledger AND ran one Auth
 *  call per member. The campaign lane exists to email CONTACTS — people the Space already
 *  has a relationship and consent record for — so we resolve the audience to its contact
 *  rows in ONE batched read and never touch auth. A member with no contact card is not
 *  emailable here; they still receive DM and Dispatch. */
async function resolveContactEmails(
  spaceId: string,
  profileIds: string[],
): Promise<{ profileId: string; contactId: string; email: string }[]> {
  if (profileIds.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }
  const { data } = await db
    .from('contacts')
    .select('id, profile_id, email')
    .eq('space_id', spaceId)
    .in('profile_id', profileIds)
  const out: { profileId: string; contactId: string; email: string }[] = []
  const seen = new Set<string>()
  for (const c of (data ?? []) as { id: string; profile_id: string | null; email: string | null }[]) {
    const email = c.email?.trim().toLowerCase()
    if (!c.profile_id || !email || seen.has(c.profile_id)) continue
    seen.add(c.profile_id)
    out.push({ profileId: c.profile_id, contactId: c.id, email })
  }
  return out
}

/** Untyped `campaigns` handle (space_id/topic reached past the generated types, ADR-246). */
function campaignsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }
  return db.from('campaigns')
}

async function sendEmailChannel(args: {
  space: ManagedSpace
  actorId: string
  subject: string
  body: string
  segments: string[]
  audience: string[]
}): Promise<BroadcastChannelResult> {
  const { space, actorId, subject, body } = args
  if (!subject) return { channel: 'email', ok: false, detail: 'Add a subject to send email.' }

  // Contacts only (ADR-863): the audience members who are Space contacts with an email on
  // file. Members who never shared an email with the Space are not emailable here.
  const emailable = await resolveContactEmails(space.id, args.audience)
  if (emailable.length === 0) {
    return {
      channel: 'email',
      ok: false,
      detail: 'No one in this audience is a contact with an email on file. Members who have not shared an email get this by DM or Dispatch instead.',
    }
  }

  // The campaigns row first (ledger + analytics + per-topic mutes), then the shared
  // delivery core, which re-runs EVERY anti-spam gate regardless of who we are: plan gate,
  // kill switch, daily cap, consent, topic mutes, suppression, per-recipient unsubscribe.
  // Topic 'marketing': a member blast is held to the STRICTEST consent bar (the double-
  // opt-in one), not a softer transactional lane — the honest default for free-form sends.
  let campaignId: string | null = null
  try {
    const { data } = await campaignsTable()
      .insert([
        {
          space_id: space.id,
          subject,
          body,
          status: 'draft',
          created_by: actorId,
          topic: 'marketing',
          audience_filter: { source: 'space_broadcast', segments: args.segments },
        },
      ])
      .select('id')
      .maybeSingle()
    campaignId = (data as { id: string } | null)?.id ?? null
  } catch {
    campaignId = null
  }
  if (!campaignId) {
    return { channel: 'email', ok: false, detail: 'Could not create the campaign. Try again.' }
  }

  // SYSTEM entry: this action's own manage gate is the authority (a moderator may hold no
  // canEditProfile), and the core still enforces the whole anti-spam battery either way.
  // Every recipient already carries its contact id (resolveContactEmails), so the ledger
  // and engagement attribution are exact and no address is looked up outside the contact set.
  const res = await sendSpaceCampaignSystem(space.id, {
    campaignId,
    subject,
    html: renderCampaignHtml(body),
    topic: 'marketing',
    recipients: emailable.map((r) => ({ email: r.email, contactId: r.contactId })),
  })
  if (isError(res)) return { channel: 'email', ok: false, detail: res.error }

  try {
    await campaignsTable()
      .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: res.data.sent })
      .eq('id', campaignId)
      .eq('space_id', space.id)
  } catch {
    // the emails already went; the stamp is non-critical.
  }

  const suppressedNote = res.data.suppressed > 0 ? ` ${res.data.suppressed} skipped (consent or unsubscribed).` : ''
  return {
    channel: 'email',
    ok: res.data.sent > 0,
    detail:
      res.data.sent > 0
        ? `Emailed ${res.data.sent} ${res.data.sent === 1 ? 'person' : 'people'}.${suppressedNote}`
        : `No emails went out.${suppressedNote || ' Everyone was suppressed or unreachable.'}`,
  }
}

/**
 * One submit, up to four lanes. Each lane reports its own {ok, detail}; one lane failing
 * never blocks another (a member should still get the DM when the email lane is off).
 */
export async function sendSpaceBroadcast(
  slug: string,
  input: BroadcastSendInput,
): Promise<ActionResult<{ results: BroadcastChannelResult[] }>> {
  const gate = await resolveManagedSpace(slug)
  if (!gate) return fail('You cannot manage this space.')
  const { space, actorId } = gate

  const subject = (input.subject ?? '').trim().slice(0, MAX_SUBJECT)
  const body = (input.body ?? '').trim().slice(0, MAX_BODY)
  if (!body) return fail('Write something to send first.')

  const channels = CHANNEL_ORDER.filter((c) => Array.isArray(input.channels) && input.channels.includes(c))
  if (channels.length === 0) return fail('Pick at least one channel.')

  // One blast bucket across all channels (fail-closed in production when unconfigured).
  if (!(await rateLimitOk('space-broadcast:send', actorId, 10, '1 h'))) {
    return fail('You have sent a lot of messages recently. Try again in a bit.')
  }

  const segments = Array.isArray(input.segments)
    ? input.segments.filter((s): s is string => typeof s === 'string')
    : []
  const audience = await resolveSpaceBroadcastAudience(space.id, segments)
  if (audience.length === 0) return fail('No one is in that audience yet.')

  // The scope-spine coordinates for the DM lane (ADR-831): a single circle or event
  // selection stamps that scope so each thread shows up in the right lane; any mix is a
  // space-wide send carried by the tenancy lane alone.
  const scope = scopeForSelection(segments)

  // Each lane resolves the recipients IT needs: the email lane its contact set, the DM lane
  // its own (bulk-dm, capped-then-resolved). No shared upfront resolution runs the whole
  // audience through the Auth API before a cap check (ADR-863).
  const results: BroadcastChannelResult[] = []
  let dispatched = false
  for (const channel of channels) {
    if (channel === 'email') {
      results.push(await sendEmailChannel({ space, actorId, subject, body, segments, audience }))
    } else if (channel === 'dm') {
      const res = await sendBulkDm({
        actorId,
        recipientProfileIds: audience,
        subject,
        body,
        spaceId: space.id,
        scope,
        bucket: 'space-broadcast',
      })
      results.push({
        channel: 'dm',
        ok: res.sent > 0,
        detail: res.detail,
      })
    } else if (channel === 'dispatch') {
      // A Space Dispatch reaches the WHOLE membership (rail + digest + push), whatever
      // segments were picked — same contract as the event lane, said out loud in the chip.
      try {
        const res = await composeSpaceDispatch({
          spaceId: space.id,
          authorId: actorId,
          title: subject || null,
          body,
          spaceName: space.name,
          spaceUrl: `/spaces/${space.slug}`,
        })
        dispatched = !!res.dispatchId
        results.push(
          dispatched
            ? { channel: 'dispatch', ok: true, detail: 'Sent as a Dispatch to all space members.' }
            : { channel: 'dispatch', ok: false, detail: 'Could not send the Dispatch. Try again.' },
        )
      } catch {
        results.push({ channel: 'dispatch', ok: false, detail: 'Could not send the Dispatch. Try again.' })
      }
    } else {
      // 'sms': the chip is disabled UI; a hand-rolled request is refused honestly (ADR-256).
      results.push({ channel: 'sms', ok: false, detail: 'Text messages are coming soon.' })
    }
  }

  revalidatePath(`/spaces/${space.slug}/messages`)
  if (dispatched) revalidatePath(`/spaces/${space.slug}`)
  return ok({ results })
}
