'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getProfileSummaries } from '@/lib/connections/matching'
import { getMemberScores, listMembersByFilter } from '@/lib/dashboard/scores'
import { listInteractionsForPerson } from '@/lib/crm/interactions'
import { buildTimeline, relativeTime, interactionTitle } from '@/lib/crm/timeline'
import { getContactEngagementStats } from '@/lib/crm/engagement-stats'
import { getSpaceContactEngagement } from '@/lib/spaces/email-analytics'
import { getMemberNetwork, filterMajorMilestones, type Milestone } from '@/lib/crm/member-network'
import { resolvePerson, type Person } from '@/lib/crm/person'
import { buildJourney } from '@/lib/crm/journey'
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

// The server action that assembles ONE member's FULLY-FEATURED right-pane MemberDetail for the
// Resonance CRM member-viewer (the platform members surface). Built from EXISTING readers / tables
// only — the profile summary (handle/avatar), the profile's role designators (community_role +
// web_role), the funnels the member is active in (funnels matched on the member's verified personas,
// Growth OS GE2), the contact / CRM pipeline (the member's open crm_deal stage), the shared
// engagement scores, and the contact_interactions timeline — so it invents NO schema. STAFF-GATED
// (the janitor floor, like the page). FAIL-SAFE by construction: every reader degrades to
// empty/nulls, the rich reads run in parallel and each is wrapped so one failing source never sinks
// the rest, and an outright failure returns a minimal identity-only detail rather than throwing, so
// the viewer's pane never crashes. No N+1: a fixed handful of batched reads for the ONE selected
// member only. Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

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
 * Assemble the CrmMemberDetail for a profile id — everything the cockpit's master-detail pane shows on
 * ONE page, in a SINGLE fetch: identity + all contact info + roles, the shared scores, the engagement
 * rollup, what they manage + are part of (the network), the MAJOR-milestone Path, and steward notes.
 * Staff-gated; reads only existing sources; never throws (returns a minimal identity detail on any
 * failure). Omits any field it cannot source cleanly, so the pane renders only what is real.
 */
export async function loadMemberDetail(profileId: string): Promise<CrmMemberDetail> {
  await requireAdmin('janitor')
  return buildMemberDetail(profileId)
}

/**
 * Space-manager path (ADR-787): a space owner / admin (or a staff previewer) loads a member's rich detail
 * INLINE in the space Resonance roster, gated on space-manage AND a TENANCY check — the member must be in
 * THIS space's reachable roster, so a manager can never read an arbitrary platform member by guessing an id.
 * Reuses the SAME builder as the admin loader, so the space + admin Resonance CRM read identically. `slug`
 * is bound server-side by the roster, so the client only passes the profile id.
 */
export async function loadSpaceMemberDetail(slug: string, profileId: string): Promise<CrmMemberDetail> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) throw new Error('Space not found')
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) throw new Error('Not authorized')
  // TENANCY: only a member in this space's own scored roster may be opened here.
  const roster = await listMembersByFilter({ kind: 'all' }, { spaceId: space.id })
  if (!roster.some((r) => r.profileId === profileId)) throw new Error('Not in this space')
  // Pass the space id so the engagement rollup (Sent/Opened/Clicked/Replied) reflects THIS space's own
  // emails to the member, never the platform CRM (no crossover).
  return buildMemberDetail(profileId, space.id)
}

/** Build the rich CRM member detail for a profile. NO gate — every caller gates + tenancy-checks first.
 *  `spaceId` scopes the engagement rollup to one space's own emails (space Resonance); omit for platform. */
async function buildMemberDetail(profileId: string, spaceId?: string): Promise<CrmMemberDetail> {
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
    const [scores, interactions, roles, funnels, pipeline, network, engagement] = await Promise.all([
      getMemberScores(profileId),
      listInteractionsForPerson([profileId, contactId], 24),
      rolesForProfile(profileId),
      funnelsForProfile(profileId),
      pipelineForProfile(profileId),
      getMemberNetwork(profileId),
      engagementP,
    ])

    // Everything is inline now, so "view all" points back at this member on the CRM home (no separate
    // member page). Kept for the generic card's "view all interactions" affordance on other surfaces.
    const viewAllHref = `/admin/crm?member=${profileId}`

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
    const notes = (person?.captures ?? [])
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
    }
  } catch {
    return base
  }
}
