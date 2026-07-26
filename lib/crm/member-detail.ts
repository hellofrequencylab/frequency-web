import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileSummaries } from '@/lib/connections/matching'
import { getMemberScores } from '@/lib/dashboard/scores'
import { listInteractionsForPerson, type ContactInteraction } from '@/lib/crm/interactions'
import { buildTimeline, relativeTime, interactionTitle } from '@/lib/crm/timeline'
import { getContactEngagementStats } from '@/lib/crm/engagement-stats'
import { getSpaceContactEngagement } from '@/lib/spaces/email-analytics'
import { getSpaceContactDetail } from '@/lib/crm/space-contact-detail'
import { getMemberNetwork, filterMajorMilestones, type Milestone } from '@/lib/crm/member-network'
import { resolvePerson, type Person } from '@/lib/crm/person'
import { buildJourney } from '@/lib/crm/journey'
import { loadMessagePath } from '@/lib/crm/message-path-io'
import { EMPTY_MESSAGE_PATH, type MessagePath, type PathScope } from '@/lib/crm/message-path'
import { tierLabel } from '@/lib/dashboard/verdict'
import { ROLE_LABEL } from '@/lib/community-roles'
import type {
  CrmMemberDetail,
  CrmScores,
  CrmEngagement,
  MemberFunnel,
  MemberInteraction,
  MemberPipeline,
  MemberRole,
} from '@/components/people/member-viewer'

// THE shared CrmMemberDetail builder (CRM Everywhere plan 1.1 / ADR-827). Assembles ONE member's
// right-pane detail for EVERY member-viewer mount — platform Resonance CRM, space Community Resonance,
// and the event/circle/hub/nexus leader surfaces. Built from EXISTING readers / tables only — the
// profile summary (handle/avatar), the profile's role designators (community_role + web_role), the
// funnels the member is active in (Growth OS GE2), the contact / CRM pipeline (open crm_deal stage),
// the shared engagement scores, and the contact_interactions timeline — so it invents NO schema.
//
// NO GATE HERE — every caller gates + tenancy-checks first (the thin action wrappers in
// app/(main)/admin/crm/members/member-detail-actions.ts and the scope siblings). The `audience` opt is
// the ALTITUDE trim (plan invariant 4): 'staff' (default) keeps everything; 'leader' (an event/circle
// host, a hub guide, a nexus mentor) OMITS the platform pipeline, funnels, steward notes, and the
// global interactions timeline — same shape, empty/undefined fields — so the pane renders cleanly
// without leaking staff CRM internals. FAIL-SAFE by construction: every reader degrades to
// empty/nulls, the rich reads run in parallel and each is wrapped so one failing source never sinks
// the rest, and an outright failure returns a minimal identity-only detail rather than throwing, so
// the viewer's pane never crashes. No N+1: a fixed handful of batched reads for the ONE selected
// member only. Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

/** Who is reading: platform staff (everything) or a scope leader (the trimmed detail). */
export type MemberDetailAudience = 'staff' | 'leader'

/**
 * The lane The Path fold reads through (ADR-827 ruling 3). Derived when omitted: a `spaceId` call
 * reads the Space lane, a staff call reads the platform lane (all lanes), and a LEADER call with no
 * scope gets NO message path at all (fail closed — a leader lane must name its scope). The event /
 * circle / hub / nexus loaders pass their own scope so the fold shows exactly that scope's comms.
 */
export type MemberDetailScope = PathScope

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

const PERSONA_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  practitioner: 'Practitioner',
  partner: 'Partner',
  builder: 'Builder',
  investor: 'Investor',
}

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

/** The contact id + email stitched to a profile (the timeline subject + the contact channel). */
async function contactForProfile(
  profileId: string,
): Promise<{ contactId: string | null; email: string | null }> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('contacts')
      .select('id, email')
      .eq('profile_id', profileId)
      .limit(1)
      .maybeSingle()
    const row = data as { id: string; email: string | null } | null
    return { contactId: row?.id ?? null, email: row?.email ?? null }
  } catch {
    return { contactId: null, email: null }
  }
}

/** Role designators from the profile: the community trust rung (member/host/guide/mentor) + the staff
 *  web_role (Admin / Executive Admin) as a danger-tone chip. Reads only profiles columns; [] on error. */
async function rolesForProfile(profileId: string): Promise<MemberRole[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('community_role, web_role')
      .eq('id', profileId)
      .maybeSingle()
    const row = data as { community_role: string | null; web_role: string | null } | null
    if (!row) return []
    const roles: MemberRole[] = []
    const community = row.community_role ?? 'member'
    // host+ is a meaningful leadership designator; plain "member" adds no signal, so skip it.
    if (community !== 'member') {
      roles.push({ label: ROLE_LABEL[community as keyof typeof ROLE_LABEL] ?? titleCase(community), tone: 'primary' })
    }
    if (row.web_role === 'janitor') roles.push({ label: 'Executive Admin', tone: 'danger' })
    else if (row.web_role === 'admin') roles.push({ label: 'Site Admin', tone: 'danger' })
    return roles
  } catch {
    return []
  }
}

/** The funnels the member is active in: the member's VERIFIED personas matched against ACTIVE funnels
 *  built for that persona (funnels.persona, Growth OS GE2). A funnel has no per-member stage, so the
 *  stage is left unset. Reads profile_personas + funnels only; [] on any error or missing table. */
async function funnelsForProfile(profileId: string): Promise<MemberFunnel[]> {
  try {
    const admin = createAdminClient()
    const { data: personaRows } = await admin
      .from('profile_personas')
      .select('persona, state')
      .eq('profile_id', profileId)
    const personas = [
      ...new Set(
        ((personaRows ?? []) as { persona: string | null; state: string | null }[])
          // an active / verified membership in the persona (not a dropped one)
          .filter((p) => p.persona && p.state !== 'revoked' && p.state !== 'declined')
          .map((p) => p.persona as string),
      ),
    ]
    if (personas.length === 0) return []

    // The funnels table is not in the generated types yet (ADR-246), so reach it untyped.
    const { data: funnelRows } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: string[]) => {
              order: (col: string, o: { ascending: boolean }) => Promise<{ data: { name: string | null }[] | null }>
            }
          }
        }
      }
    })
      .from('funnels')
      .select('name, persona, status')
      .eq('status', 'active')
      .in('persona', personas)
      .order('created_at', { ascending: false })

    const personaLabels = personas
      .map((p) => PERSONA_LABELS[p] ?? titleCase(p))
      .join(', ')

    return ((funnelRows ?? []) as { name: string | null }[])
      .filter((f) => f.name)
      .map((f) => ({ name: f.name as string, stage: personaLabels || undefined }))
  } catch {
    return []
  }
}

/** The member's CRM pipeline stage: their most recently updated OPEN deal, labeled with its stage
 *  name. Reads crm_deals + crm_stages only; null when the member has no open deal or on any error. */
async function pipelineForProfile(profileId: string): Promise<MemberPipeline | null> {
  try {
    const admin = createAdminClient()
    const { data: dealRow } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { title: string | null; stage_id: string | null } | null }>
                }
              }
            }
          }
        }
      }
    })
      .from('crm_deals')
      .select('title, stage_id')
      .eq('profile_id', profileId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const deal = dealRow as { title: string | null; stage_id: string | null } | null
    if (!deal || !deal.stage_id) return null

    const { data: stageRow } = await admin
      .from('crm_stages')
      .select('name')
      .eq('id', deal.stage_id)
      .maybeSingle()
    const stageName = (stageRow as { name: string | null } | null)?.name
    if (!stageName) return null

    return { label: deal.title?.trim() || 'Pipeline', stage: stageName }
  } catch {
    return null
  }
}

/** A short, plain date (no em dashes). '' for a blank / unparseable timestamp. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Resolve the unified person for a contact id, fail-safe to null (never throws). */
async function safePerson(contactId: string | null): Promise<Person | null> {
  if (!contactId) return null
  try {
    return await resolvePerson(contactId)
  } catch {
    return null
  }
}

/** The MAJOR-milestone "Path" rail from a resolved person: build the full journey, then keep only the
 *  handful of major life events (joined, started a circle, hosted an event, created a space, invited a
 *  friend). [] when there is no person. Never throws. */
function milestonesFromPerson(person: Person | null): Milestone[] {
  if (!person) return []
  try {
    const { contact, member, captures } = person
    const journey = buildJourney({
      contact: {
        source: contact.source,
        firstSeenAt: contact.firstSeenAt,
        createdAt: contact.createdAt,
        acquisition: member?.acquisition ?? contact.acquisition,
      },
      member: member ? { createdAt: member.createdAt, referred: member.referred } : null,
      captures: captures.map((c) => ({ source: c.source, ownerName: c.ownerName, invitedAt: c.invitedAt, createdAt: c.createdAt })),
      scans: person.scans.map((s) => ({ codeTitle: s.codeTitle, scannedAt: s.scannedAt })),
      events: person.events.map((e) => ({ eventType: e.eventType, source: e.source, createdAt: e.createdAt })),
      activities: person.activities.map((a) => ({ kind: a.kind, body: a.body, createdAt: a.createdAt })),
      deals: person.deals.map((d) => ({ title: d.title, status: d.status, createdAt: contact.createdAt ?? '' })),
    })
    return filterMajorMilestones(journey, 8)
  } catch {
    return []
  }
}

/**
 * Build the rich CRM member detail for a profile. NO gate — every caller gates + tenancy-checks first.
 * `opts.spaceId` scopes the engagement rollup (and the timeline read) to one space's own emails (space
 * Resonance); omit for platform. `opts.audience` is the altitude trim: 'staff' (default) keeps
 * everything; 'leader' OMITS the pipeline, funnels, steward notes, and the global interactions
 * timeline (empty/undefined in the same shape) while keeping identity, scores, the engagement rollup,
 * the network, and milestones — so a scope leader's pane never shows staff CRM internals.
 * `opts.scope` names the lane The Path fold reads (see MemberDetailScope): omit it and the lane is
 * derived (space / platform), except for a leader, who fails closed to an empty path.
 */
export async function buildMemberDetail(
  profileId: string,
  opts?: { spaceId?: string; audience?: MemberDetailAudience; scope?: MemberDetailScope },
): Promise<CrmMemberDetail> {
  const spaceId = opts?.spaceId
  const leader = opts?.audience === 'leader'
  // The Path lane: an explicit scope wins; a Space call derives its Space lane; staff derive the
  // platform lane. A LEADER with no scope gets null — never a global read (plan invariant 4).
  const pathScope: PathScope | null =
    opts?.scope ?? (spaceId ? { kind: 'space', id: spaceId } : leader ? null : { kind: 'platform' })

  // Identity is the floor — resolve it first so we can always return something.
  const summaries = await getProfileSummaries([profileId])
  const summary = summaries.get(profileId)
  const handle = summary?.handle ?? profileId
  const displayName = summary?.displayName ?? handle
  const profileHref = summary?.handle ? `/people/${summary.handle}` : undefined
  const base: CrmMemberDetail = {
    profileId,
    displayName,
    handle,
    avatarUrl: summary?.avatarUrl ?? null,
    profileHref,
  }

  try {
    const { contactId, email } = await contactForProfile(profileId)

    // The unified person (captures / journey / notes / phone) — one fail-safe read used by several of
    // the assembled fields below; resolved first so the engagement rollup can span every subject id.
    const person = await safePerson(contactId)
    const captureIds = person?.captures.map((c) => c.id) ?? []
    const subjectIds = [profileId, contactId, ...captureIds].filter((s): s is string => !!s)

    // Batch the rich reads for the ONE selected member. Each source is independently fail-safe, so a
    // single failing read leaves the others intact rather than collapsing to the identity floor.
    // Engagement rollup. For a SPACE scope, this space's OWN emails to the member only (sent from
    // outreach_sends + opens/clicks/replies from space_email_events) — no crossover to the platform CRM.
    // Otherwise the platform-wide rollup. Both resolve to the same {sent,opened,clicked,replied,lastTouchAt}
    // shape so the pane reads identically.
    const engagementP = spaceId
      ? getSpaceContactEngagement(spaceId, email ? [email] : []).then((m) => {
          const e = (email ? m.get(email.trim().toLowerCase()) : undefined) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 }
          return { sent: e.sent, opened: e.opened, clicked: e.clicked, replied: e.replied, lastTouchAt: null as string | null }
        })
      : getContactEngagementStats(subjectIds, email)
    // The LEADER trim skips the staff-only reads entirely (never fetched, not just hidden).
    const [scores, interactions, roles, funnels, pipeline, network, engagement, path] = await Promise.all([
      getMemberScores(profileId),
      // Member-360 timeline (ADR-796). For a SPACE member view (spaceId set) STRICTLY scope to this Space
      // so it never surfaces the member's touches from OTHER spaces / private platform DMs (the same tenancy
      // boundary the contact card enforces), and read a fuller 100 (was a global, uncapped-tenant 24). The
      // platform admin person-view (no spaceId) stays global at 24.
      leader
        ? Promise.resolve([] as ContactInteraction[])
        : listInteractionsForPerson([profileId, contactId], spaceId ? 100 : 24, spaceId),
      rolesForProfile(profileId),
      leader ? Promise.resolve([] as MemberFunnel[]) : funnelsForProfile(profileId),
      leader ? Promise.resolve(null as MemberPipeline | null) : pipelineForProfile(profileId),
      getMemberNetwork(profileId),
      engagementP,
      // The Path fold-down (ADR-827 ruling 3): the thread-grouped message history through the
      // viewer's lane, assembled in parallel with the rest so the pane stays exactly as fast.
      // Fail-safe (the reader degrades to the empty path) and fail-closed (no lane, no read).
      pathScope
        ? loadMessagePath({
            subjectIds,
            memberName: displayName,
            scope: pathScope,
            audience: leader ? 'leader' : 'staff',
          }).catch(() => EMPTY_MESSAGE_PATH)
        : Promise.resolve(null as MessagePath | null),
    ])

    // Everything is inline now, so "view all" points back at this member on the CRM home (no separate
    // member page). Kept for the generic card's "view all interactions" affordance on other surfaces.
    // Staff only: the leader trim omits the timeline, and /admin/crm is a staff-gated destination.
    const viewAllHref = leader ? undefined : `/admin/crm?member=${profileId}`

    // The truncated interaction list (the generic card caps the render at ~5). Newest first.
    const timeline = buildTimeline({ interactions }, 12)
    const memberInteractions: MemberInteraction[] = timeline.map((t) => ({
      kind: interactionTitle(t.channel, t.direction),
      summary: t.title || interactionTitle(t.channel, t.direction),
      when: relativeTime(t.at) || 'Recently',
    }))

    // Engagement stats from the shared scores — for the generic card's compact grid.
    const engagementStats: NonNullable<CrmMemberDetail['engagementStats']> = []
    if (scores.resonanceHealth != null) engagementStats.push({ label: 'Health', value: String(Math.round(scores.resonanceHealth)) })
    if (scores.resonanceTier) engagementStats.push({ label: 'Tier', value: tierLabel(scores.resonanceTier) })
    if (scores.activationPropensity != null) engagementStats.push({ label: 'Activation', value: String(Math.round(scores.activationPropensity)) })
    if (scores.lifecycleStage) engagementStats.push({ label: 'Stage', value: LIFECYCLE_LABELS[scores.lifecycleStage] ?? scores.lifecycleStage })

    // ── The CRM master-detail fields (the inline "everything about them" pane) ──
    const crmScores: CrmScores = {
      health: scores.resonanceHealth,
      tier: scores.resonanceTier ? tierLabel(scores.resonanceTier) : null,
      churn: scores.churnRisk ? titleCase(scores.churnRisk) : null,
      activation: scores.activationPropensity,
      lifecycle: scores.lifecycleStage ? LIFECYCLE_LABELS[scores.lifecycleStage] ?? scores.lifecycleStage : null,
    }
    const hasScores = crmScores.health != null || crmScores.tier || crmScores.churn || crmScores.activation != null || crmScores.lifecycle

    const crmEngagement: CrmEngagement = {
      sent: engagement.sent,
      opened: engagement.opened,
      clicked: engagement.clicked,
      replied: engagement.replied,
      lastTouch: engagement.lastTouchAt ? fmtDate(engagement.lastTouchAt) : null,
    }

    const phone = person?.captures.find((c) => c.phone)?.phone ?? null
    // Steward notes are staff CRM content — the leader trim never assembles them.
    const notes = leader
      ? []
      : (person?.captures ?? [])
          .flatMap((c) => c.notes.map((n) => ({ id: n.id, body: n.body })))
          .filter((n) => n.body.trim().length > 0)
          .slice(0, 6)
    const milestones = milestonesFromPerson(person)

    const contact =
      email || phone ? { email: email ?? undefined, phone: phone ?? undefined } : undefined

    return {
      ...base,
      email,
      contact,
      roles: roles.length ? roles : undefined,
      funnels: funnels.length ? funnels : undefined,
      pipeline: pipeline ?? undefined,
      interactions: memberInteractions.length ? memberInteractions : undefined,
      engagementStats: engagementStats.length ? engagementStats : undefined,
      viewAllHref,
      // CRM master-detail:
      scores: hasScores ? crmScores : undefined,
      engagement: crmEngagement,
      network,
      milestones: milestones.length ? milestones : undefined,
      notes: notes.length ? notes : undefined,
      path: path ?? undefined,
    }
  } catch {
    return base
  }
}

/**
 * Build a CrmMemberDetail for a space CONTACT (lead), so the member-viewer's CRM pane renders it just like
 * a member: identity + email + scores (when the lead is stitched/scored) + the Space's own engagement
 * rollup + notes. `profileHref` is left undefined so a lead never shows a broken "Open Profile" link, and
 * the composer keys off the email (messageScope). getSpaceContactDetail re-gates space-manage; on any
 * miss we return a minimal identity detail rather than throwing, so the pane never crashes.
 */
export async function buildSpaceContactDetail(spaceId: string, contactId: string): Promise<CrmMemberDetail> {
  const minimal: CrmMemberDetail = { profileId: `contact:${contactId}`, displayName: 'Contact', handle: contactId }
  try {
    const detail = await getSpaceContactDetail(spaceId, contactId)
    if (!detail) return minimal
    const { identity, insight, notes } = detail
    const email = identity.email
    const engMap = await getSpaceContactEngagement(spaceId, email ? [email] : [])
    const e = (email ? engMap.get(email.trim().toLowerCase()) : undefined) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 }
    const crmScores: CrmScores = {
      health: insight.scores.resonanceHealth,
      tier: insight.scores.resonanceTier ? tierLabel(insight.scores.resonanceTier) : null,
      churn: insight.scores.churnRisk ? titleCase(insight.scores.churnRisk) : null,
      activation: insight.scores.activationPropensity,
      lifecycle: insight.scores.lifecycleStage ? LIFECYCLE_LABELS[insight.scores.lifecycleStage] ?? insight.scores.lifecycleStage : null,
    }
    const contact = email || identity.phone ? { email: email || undefined, phone: identity.phone ?? undefined } : undefined
    const mappedNotes = notes.map((n) => ({ id: n.id, body: n.body })).filter((n) => n.body.trim().length > 0)
    return {
      profileId: insight.profileId ?? `contact:${contactId}`,
      displayName: identity.name?.trim() || email.split('@')[0] || 'Contact',
      handle: email || contactId,
      avatarUrl: null,
      // No profileHref: a lead has no member profile page, so the pane suppresses the Open Profile link.
      email,
      contact,
      scores: insight.hasScores ? crmScores : undefined,
      engagement: { sent: e.sent, opened: e.opened, clicked: e.clicked, replied: e.replied, lastTouch: null },
      notes: mappedNotes.length ? mappedNotes : undefined,
    }
  } catch {
    return minimal
  }
}
