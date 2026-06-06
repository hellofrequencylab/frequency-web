'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'

// Headline engagement numbers for the in-place Insights summary (ADR-138 — the
// Insights category). The full dashboards (Engagement / Intel / Outcomes / AI read /
// Segments) stay on their pages, linked in the console; this is a janitor at-a-glance
// header. Janitor-gated (the full insights pages also admit staff insights-read; this
// additive summary is a janitor bonus and degrades to nothing for them).
export async function loadEngagementSummary() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  const d = await getEngagementDashboard(30)
  return {
    windowDays: d.windowDays,
    wam: d.practice.wam,
    verified: d.practice.verifiedThisWeek,
    newMembers: d.practice.newMembers,
    activationRate: d.practice.activationRate,
  }
}
