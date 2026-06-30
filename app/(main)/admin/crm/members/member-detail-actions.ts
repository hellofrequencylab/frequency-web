'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileSummaries } from '@/lib/connections/matching'
import { getMemberScores } from '@/lib/dashboard/scores'
import { listInteractionsForPerson } from '@/lib/crm/interactions'
import { buildTimeline, relativeTime, interactionTitle } from '@/lib/crm/timeline'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { MemberDetail } from '@/components/people/member-viewer'

// The server action that assembles ONE member's right-pane MemberDetail for the Resonance CRM
// member-viewer (the platform members surface). Built from EXISTING readers only — the profile
// summary (handle/avatar), the shared engagement scores, and the contact_interactions timeline —
// so it invents no schema. STAFF-GATED (the janitor floor, like the page). FAIL-SAFE by
// construction: every reader degrades to empty/nulls, and an outright failure is returned as a
// minimal identity-only detail rather than throwing, so the viewer's pane never crashes. Copy is
// plain, no em dashes (docs/CONTENT-VOICE.md).

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
  const base: MemberDetail = {
    displayName,
    handle,
    avatarUrl: summary?.avatarUrl ?? null,
    profileHref: summary?.handle ? `/people/${summary.handle}` : undefined,
  }

  try {
    const { contactId, email } = await contactForProfile(profileId)

    const [scores, interactions] = await Promise.all([
      getMemberScores(profileId),
      // A person is stitched from several subject rows; pass the profile id + contact id.
      listInteractionsForPerson([profileId, contactId], 12),
    ])

    // Recent activity from the one timeline reader (newest first, a small slice).
    const timeline = buildTimeline({ interactions }, 6)
    const latestActivity = timeline.map((t) => ({
      label: t.title || interactionTitle(t.channel, t.direction),
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
      latestActivity: latestActivity.length ? latestActivity : undefined,
      engagementStats: engagementStats.length ? engagementStats : undefined,
      // The timeline front door for staff: the contact's interaction history.
      actions: contactId
        ? [
            {
              key: 'timeline',
              label: 'Open timeline',
              icon: 'profile',
              href: `/admin/marketing/contacts/${contactId}`,
              variant: 'secondary' as const,
            },
          ]
        : undefined,
    }
  } catch {
    return base
  }
}

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}
