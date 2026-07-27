'use server'

// JOURNEY LAUNCH actions (ADR-840). Everything the publisher does on /journeys/[slug]/launch,
// riding the EXISTING machinery in every direction — nothing here is a parallel sender, a second
// campaign store, or a private funnel builder:
//
//   Schedule a send  → lib/spaces/campaigns.ts (createSpaceCampaign + scheduleSpaceCampaign), the
//                      same `campaigns` rows the Space composer writes, so the scheduled-send cron
//                      delivers them with its kill-switch, cap, consent, and unsubscribe intact.
//   Build the funnel → the Growth OS builder (app/(main)/admin/growth/funnels/actions.ts):
//                      createFunnel + addStageLink with the real 'campaign' StageRefType.
//   Message enrollees→ the comms spine (openOrGetConversation + appendConversationMessage), the
//                      same operator-DM lane the event broadcast uses.
//
// AUTHORIZATION IS RE-CHECKED HERE, ALWAYS. Every action re-resolves the launch context
// (resolveJourneyLaunchContext → canEditJourney + resolveJourneyAccess) server-side and re-applies
// the tier subset with canScheduleLaunchKey. The client picks what to send; it never decides what
// it is allowed to send. The Space campaign helpers gate again on their own (canEditProfile) and
// the funnel builder gates again on the marketing capability, so each write passes two doors.
//
// Typed Supabase clients only.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitOk } from '@/lib/rate-limit'
import { isBlockedBetween } from '@/lib/blocking'
import { openOrGetConversation, appendConversationMessage } from '@/lib/comms/conversations'
import type { InteractionScopeRef } from '@/lib/crm/interactions'
import { createSpaceCampaign, scheduleSpaceCampaign, parseScheduleTime } from '@/lib/spaces/campaigns'
import { createFunnel, addStageLink } from '@/app/(main)/admin/growth/funnels/actions'
import { getFunnel } from '@/lib/funnels/store'
import { resolveJourneyLaunchContext, type JourneyLaunchContext } from '@/lib/journeys/launch-access'
import { LAUNCH_CAMPAIGN_KEYS, type LaunchCampaignKey } from '@/lib/journeys/launch-campaigns'
import {
  canScheduleLaunchKey,
  LAUNCH_SERIES_LOCKED_ERROR,
  LAUNCH_NEEDS_SPACE_MESSAGE,
} from '@/lib/journeys/launch-surface'
import type {
  BroadcastChannelKey,
  BroadcastChannelResult,
  BroadcastSendInput,
} from '@/components/comms/broadcast-types'

// ── THE DORMANT JOURNEY COMMS SCOPE (migration 20261228000000, DRAFT) ───────────────────────────
//
// The scope spine's `scope_kind` CHECK does NOT include 'journey' in production yet: the widening
// migration (supabase/migrations/20261228000000_comms_scope_journey_vocab.sql) is a draft awaiting
// owner approval. Writing scope_kind='journey' before it applies would be REFUSED BY POSTGRES and
// would take the whole message down with it.
//
// So the journey lane ships DORMANT, the same way lib/journeys/drip-sends.ts ships its ledger
// dormant: the flag below is the single switch, and while it is false every journey-scoped write
// falls back to an UNSCOPED conversation (scope_kind null, which every deployed CHECK accepts).
// Nothing is lost — the message still sends, it just does not carry the journey lane tag yet.
//
// TO TURN IT ON, in this order: (1) the owner approves + applies the migration, (2) 'journey'
// joins InteractionScopeKind in lib/crm/interactions.ts (the type union is the second, compile-time
// guard: `scopeKind: 'journey'` does not even typecheck today), (3) flip this to true.
const JOURNEY_COMMS_SCOPE_LIVE = false

/** The comms scope fields for a Journey thread, or `undefined` while the vocabulary is dormant.
 *  ONE place decides, so no call site can smuggle 'journey' past the guard. Note the return type
 *  is the spine's own `InteractionScopeRef['kind']`, which does not include 'journey' yet: the type
 *  union is the compile-time half of this guard, and it widens with step 2 above. */
function journeyCommsScope(): { scopeKind: InteractionScopeRef['kind']; scopeId: string } | undefined {
  if (!JOURNEY_COMMS_SCOPE_LIVE) return undefined
  // Once the migration applies AND 'journey' joins InteractionScopeKind, this takes the plan id
  // back as a parameter and becomes exactly:
  //   return { scopeKind: 'journey', scopeId: planId }
  return undefined
}

// ── Shared gate ─────────────────────────────────────────────────────────────────────────────────

/** Re-resolve the launch context for the CURRENT caller, or a plain error message to return (the
 *  `requireMarketer` shape). The one door every action below goes through, so no client claim about
 *  who it is or what tier it holds is ever taken at face value. */
async function requireLaunchContext(planId: string): Promise<JourneyLaunchContext | string> {
  const caller = await getCallerProfile()
  if (!caller) return 'Sign in to launch this Journey.'
  const ctx = await resolveJourneyLaunchContext(planId, {
    profileId: caller.id,
    role: caller.community_role,
    webRole: caller.webRole,
    tier: caller.membershipTier,
    realTier: caller.realMembershipTier,
  })
  if (!ctx) return 'Only the author or the Space team can launch this Journey.'
  return ctx
}

function revalidateLaunch(slug: string): void {
  revalidatePath(`/journeys/${slug}/launch`)
}

// ── Scheduling the series ───────────────────────────────────────────────────────────────────────

/** What the client hands back for one reviewed send. The draft copy is EDITABLE, so the action
 *  takes the edited text; only the series key is a fixed vocabulary. */
export interface LaunchSendInput {
  key: string
  subject: string
  body: string
  /** ISO string. Must be in the future (parseScheduleTime rejects the past, fail-closed). */
  sendAt: string
}

function isLaunchKey(raw: string): raw is LaunchCampaignKey {
  return (LAUNCH_CAMPAIGN_KEYS as readonly string[]).includes(raw)
}

/**
 * Schedule ONE reviewed send: a `campaigns` row in the Journey's Space (status 'draft'), then the
 * existing schedule action (status 'scheduled' + scheduled_for). The Space cron delivers it; this
 * never sends anything itself.
 *
 * Refuses, in order: a viewer who cannot edit the Journey, a send outside the viewer's tier subset,
 * a Journey with no Space behind it (no contact list to send to), and a send time in the past.
 */
export async function scheduleLaunchSendAction(
  planId: string,
  input: LaunchSendInput,
): Promise<ActionResult<{ campaignId: string }>> {
  const ctx = await requireLaunchContext(planId)
  if (typeof ctx === 'string') return fail(ctx)

  if (!isLaunchKey(input.key)) return fail('That is not part of the launch series.')
  if (!canScheduleLaunchKey(input.key, ctx.access.launchCampaignsAllowed)) {
    return fail(LAUNCH_SERIES_LOCKED_ERROR)
  }
  if (!ctx.spaceId) return fail(LAUNCH_NEEDS_SPACE_MESSAGE)
  if (!parseScheduleTime(input.sendAt)) return fail('Pick a send time in the future.')

  // The campaign machinery owns validation (subject required, body required to schedule) and its
  // own Space-editor gate; a launch send is a marketing-topic campaign like any other.
  const created = await createSpaceCampaign(ctx.spaceId, {
    subject: input.subject,
    body: input.body,
    topic: 'marketing',
  })
  if (isError(created)) return created

  const scheduled = await scheduleSpaceCampaign(ctx.spaceId, created.data.id, input.sendAt)
  if (isError(scheduled)) return scheduled

  revalidateLaunch(ctx.slug)
  return ok({ campaignId: created.data.id })
}

/**
 * Schedule the whole reviewed series in one pass. Each send goes through the single-send action
 * above, so the gate + validation are identical; a send that fails does not abort the ones after
 * it, and the result reports exactly which keys landed (the surface marks those scheduled).
 */
export async function scheduleLaunchSeriesAction(
  planId: string,
  sends: LaunchSendInput[],
): Promise<ActionResult<{ scheduled: { key: string; campaignId: string }[]; failed: string[] }>> {
  const ctx = await requireLaunchContext(planId)
  if (typeof ctx === 'string') return fail(ctx)

  const scheduled: { key: string; campaignId: string }[] = []
  const failed: string[] = []
  let lastError = ''
  for (const send of sends) {
    const res = await scheduleLaunchSendAction(planId, send)
    if (isError(res)) {
      failed.push(send.key)
      lastError = res.error
    } else {
      scheduled.push({ key: send.key, campaignId: res.data.campaignId })
    }
  }
  if (scheduled.length === 0) return fail(lastError || 'Nothing could be scheduled. Check the send times.')

  revalidateLaunch(ctx.slug)
  return ok({ scheduled, failed })
}

// ── Build the funnel ────────────────────────────────────────────────────────────────────────────

/**
 * One click: a Growth OS funnel for this launch, with each scheduled campaign wired to a stage.
 *
 * Rides the REAL builder (createFunnel gives the four canonical stages entry/wedge/capture/convert;
 * addStageLink attaches typed 'campaign' references by campaign id), so the funnel shows up in
 * /admin/growth/funnels and its rollup like any other. Both builder calls re-check the marketing
 * capability themselves, which is why a viewer without it gets that gate's own message back.
 *
 * The campaigns map to stages in series order: Announce is the entry, Enrollment open the wedge,
 * Last call the capture, Kickoff the convert. Fewer campaigns simply fill fewer stages.
 */
export async function buildLaunchFunnelAction(
  planId: string,
  campaignIds: string[],
): Promise<ActionResult<{ funnelId: string; linked: number }>> {
  const ctx = await requireLaunchContext(planId)
  if (typeof ctx === 'string') return fail(ctx)

  const ids = campaignIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
  if (ids.length === 0) return fail('Schedule at least one send first, then build the funnel.')

  const created = await createFunnel({
    name: `${ctx.title} launch`,
    description: `The launch series for the ${ctx.title} Journey.`,
    // The measurable win the launch campaigns drive today. No enrollment event reaches the
    // engagement ledger yet, so pointing the goal at one would give the rollup a metric nothing
    // writes; an operator can change the goal in the funnel builder once that lands.
    goalEvent: 'signup',
  })
  if (isError(created)) return created

  const funnel = await getFunnel(created.data.id)
  const stages = funnel?.stages ?? []
  let linked = 0
  for (let i = 0; i < ids.length && i < stages.length; i++) {
    const res = await addStageLink({ stageId: stages[i].id, refType: 'campaign', refId: ids[i] })
    if (!isError(res)) linked++
  }

  revalidateLaunch(ctx.slug)
  return ok({ funnelId: created.data.id, linked })
}

// ── Message enrollees ───────────────────────────────────────────────────────────────────────────

/** Direct Messages write rows per recipient in one request, so the blast is bounded (the event
 *  broadcast's cap, same reason). */
const DM_BLAST_CAP = 300

/** The enrollee segments the composer offers. Resolved server-side from the segment KEYS the
 *  client picked; the client's own profile ids are display-only and never trusted. */
type EnrolleeSegmentKey = 'all' | 'in_progress' | 'finished'

function isSegmentKey(raw: string): raw is EnrolleeSegmentKey {
  return raw === 'all' || raw === 'in_progress' || raw === 'finished'
}

/** Re-resolve the picked segments to a deduped profile id set, from the enrollment rows. */
async function resolveEnrolleeAudience(planId: string, segments: string[]): Promise<string[]> {
  const keys = segments.filter(isSegmentKey)
  if (keys.length === 0) return []
  const { data } = await createAdminClient()
    .from('journey_enrollments')
    .select('profile_id, completed_at')
    .eq('plan_id', planId)
  const rows = (data ?? []) as { profile_id: string; completed_at: string | null }[]
  const out = new Set<string>()
  for (const row of rows) {
    const finished = !!row.completed_at
    if (keys.includes('all')) out.add(row.profile_id)
    else if (finished && keys.includes('finished')) out.add(row.profile_id)
    else if (!finished && keys.includes('in_progress')) out.add(row.profile_id)
  }
  return [...out]
}

/** display name + auth email per recipient (the spine threads by counterpart address, so a member
 *  with no address cannot be threaded). Best-effort per row. */
async function resolveRecipientEmails(profileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (profileIds.length === 0) return out
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, auth_user_id').in('id', profileIds)
  for (const p of (data ?? []) as { id: string; auth_user_id: string | null }[]) {
    if (!p.auth_user_id) continue
    try {
      const { data: u } = await admin.auth.admin.getUserById(p.auth_user_id)
      const email = u?.user?.email?.trim().toLowerCase()
      if (email) out.set(p.id, email)
    } catch {
      // no address resolved; the recipient is counted as skipped below.
    }
  }
  return out
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

/**
 * Message the Journey's enrollees from the launch surface, through the shared BroadcastComposer.
 *
 * Only the Direct Message lane is live here: it rides the comms spine (one conversation per
 * recipient, kind 'crm', channel 'in_app'), the same operator-DM path the event broadcast uses,
 * so every message is logged and lands in the member's own Frequency inbox. Email, Dispatch, and
 * Text are offered as disabled chips by the surface with honest reasons (refuse-first, ADR-256) —
 * a smuggled key is refused here too rather than silently ignored.
 *
 * SCOPE: see JOURNEY_COMMS_SCOPE_LIVE at the top of this file. Until the journey vocabulary
 * migration applies, these conversations open UNSCOPED rather than carrying scope_kind='journey',
 * which the deployed CHECK would reject.
 */
export async function sendJourneyBroadcastAction(
  planId: string,
  input: BroadcastSendInput,
): Promise<ActionResult<{ results: BroadcastChannelResult[] }>> {
  const ctx = await requireLaunchContext(planId)
  if (typeof ctx === 'string') return fail(ctx)

  const body = (input.body ?? '').trim()
  if (!body) return fail('Write your message first.')
  const subject = (input.subject ?? '').trim().slice(0, 200) || ctx.title

  const picked = (input.channels ?? []) as BroadcastChannelKey[]
  if (picked.length === 0) return fail('Pick at least one channel.')
  const unsupported = picked.filter((c) => c !== 'dm')
  const results: BroadcastChannelResult[] = unsupported.map((channel) => ({
    channel,
    ok: false,
    detail:
      channel === 'sms'
        ? 'Text is not available yet.'
        : 'That channel is not wired for Journeys yet. Use the launch series above to email your list.',
  }))
  if (!picked.includes('dm')) return ok({ results })

  const audience = await resolveEnrolleeAudience(planId, input.segments ?? [])
  const eligible = audience.filter((id) => id !== ctx.viewerId)
  if (eligible.length === 0) {
    results.push({ channel: 'dm', ok: false, detail: 'No one in that audience yet.' })
    return ok({ results })
  }
  if (eligible.length > DM_BLAST_CAP) {
    results.push({
      channel: 'dm',
      ok: false,
      detail: `That is too many people for Direct Messages (limit ${DM_BLAST_CAP}). Use a launch campaign for a list this size.`,
    })
    return ok({ results })
  }

  // Shared abuse buckets (the scoped-DM lane's per-minute token, drawn once per blast, plus a
  // per-hour broadcast bucket). Fail-closed in production when unconfigured (lib/rate-limit).
  if (!(await rateLimitOk('journey-broadcast:dm', ctx.viewerId, 10, '1 h'))) {
    results.push({ channel: 'dm', ok: false, detail: 'You have sent a lot of messages recently. Try again in a bit.' })
    return ok({ results })
  }
  if (!(await rateLimitOk('scoped-dm:msg', ctx.viewerId, 20, '1 m'))) {
    results.push({ channel: 'dm', ok: false, detail: 'Slow down a little. Try again in a minute.' })
    return ok({ results })
  }

  const emails = await resolveRecipientEmails(eligible)
  const scope = journeyCommsScope()
  let sent = 0
  let skipped = 0
  for (const profileId of eligible) {
    try {
      if (await isBlockedBetween(ctx.viewerId, profileId)) {
        skipped++
        continue
      }
      const email = emails.get(profileId)
      if (!email) {
        skipped++
        continue
      }
      const conv = await openOrGetConversation({
        kind: 'crm',
        channel: 'in_app',
        externalEmail: email,
        ownerProfileId: ctx.viewerId,
        subject,
        memberProfileId: profileId,
        spaceId: ctx.spaceId,
        ...scope,
        metadata: { kind: 'journey_broadcast', journey_plan_id: planId },
      })
      if (!conv) {
        skipped++
        continue
      }
      const appended = await appendConversationMessage({
        conversationId: conv.id,
        direction: 'outbound',
        authorKind: 'leader',
        authorId: ctx.viewerId,
        channel: 'in_app',
        body,
        mirror: {
          ownerProfileId: ctx.viewerId,
          subjectKind: 'profile',
          subjectId: profileId,
          spaceId: ctx.spaceId,
          subject,
        },
      })
      if (appended && 'id' in appended) sent++
      else skipped++
    } catch {
      skipped++
    }
  }

  let detail = `Delivered to ${people(sent)} in their Frequency inbox.`
  if (skipped > 0) detail += ` ${skipped} skipped (blocked or unreachable).`
  results.push({ channel: 'dm', ok: sent > 0, detail })
  return ok({ results })
}
