'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileSummaries } from '@/lib/connections/matching'
import { getMemberScores } from '@/lib/dashboard/scores'
import { listInteractionsForPerson } from '@/lib/crm/interactions'
import { buildTimeline, relativeTime, interactionTitle } from '@/lib/crm/timeline'
import { tierLabel } from '@/lib/dashboard/verdict'
import { ROLE_LABEL } from '@/lib/community-roles'
import type {
  MemberDetail,
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

/**
 * Assemble the MemberDetail for a profile id. Staff-gated; reads only existing sources; never throws
 * (returns a minimal identity detail on any failure). Omits any field it cannot source cleanly.
 */
export async function loadMemberDetail(profileId: string): Promise<MemberDetail> {
  await requireAdmin('janitor')

  // Identity is the floor — resolve it first so we can always return something.
  const summaries = await getProfileSummaries([profileId])
  const summary = summaries.get(profileId)
  const handle = summary?.handle ?? profileId
  const displayName = summary?.displayName ?? handle
  const profileHref = summary?.handle ? `/people/${summary.handle}` : undefined
  const base: MemberDetail = {
    displayName,
    handle,
    avatarUrl: summary?.avatarUrl ?? null,
    profileHref,
  }

  try {
    const { contactId, email } = await contactForProfile(profileId)

    // Batch the rich reads for the ONE selected member. Each source is independently fail-safe, so a
    // single failing read leaves the others intact rather than collapsing to the identity floor.
    const [scores, interactions, roles, funnels, pipeline] = await Promise.all([
      getMemberScores(profileId),
      // A person is stitched from several subject rows; pass the profile id + contact id.
      listInteractionsForPerson([profileId, contactId], 24),
      rolesForProfile(profileId),
      funnelsForProfile(profileId),
      pipelineForProfile(profileId),
    ])

    // The full member / timeline page: the staff contact timeline when stitched, else the public
    // profile. This is the View member button + the "view all interactions" target.
    const viewAllHref = contactId ? `/admin/marketing/contacts/${contactId}` : profileHref

    // The truncated interaction list (the card caps the render at ~5; we hand it a few more so the
    // "view all" affordance has a real overflow count). Newest first out of the timeline reader.
    const timeline = buildTimeline({ interactions }, 12)
    const memberInteractions: MemberInteraction[] = timeline.map((t) => ({
      kind: interactionTitle(t.channel, t.direction),
      summary: t.title || interactionTitle(t.channel, t.direction),
      when: relativeTime(t.at) || 'Recently',
    }))

    // Engagement stats from the shared scores — only the ones present (never fabricated).
    const engagementStats: NonNullable<MemberDetail['engagementStats']> = []
    if (scores.resonanceHealth != null) {
      engagementStats.push({ label: 'Health', value: String(Math.round(scores.resonanceHealth)) })
    }
    if (scores.resonanceTier) {
      engagementStats.push({ label: 'Tier', value: tierLabel(scores.resonanceTier) })
    }
    if (scores.activationPropensity != null) {
      engagementStats.push({
        label: 'Activation',
        value: String(Math.round(scores.activationPropensity)),
      })
    }
    if (scores.lifecycleStage) {
      engagementStats.push({ label: 'Stage', value: LIFECYCLE_LABELS[scores.lifecycleStage] ?? scores.lifecycleStage })
    }

    return {
      ...base,
      contact: email ? { email } : undefined,
      roles: roles.length ? roles : undefined,
      funnels: funnels.length ? funnels : undefined,
      pipeline: pipeline ?? undefined,
      interactions: memberInteractions.length ? memberInteractions : undefined,
      engagementStats: engagementStats.length ? engagementStats : undefined,
      viewAllHref,
    }
  } catch {
    return base
  }
}
