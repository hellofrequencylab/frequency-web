'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { getGrowthReading } from '@/lib/analytics/growth-read'
import { campaignCsv, growthAiEvidence, growthExperiments } from '@/lib/analytics/growth'
import { aiEnabled } from '@/lib/ai/client'
import { completeText } from '@/lib/ai/complete'
import { withVoice } from '@/lib/ai/voice'

// parse-ok: No client arguments; exports only the authenticated server-side aggregate.
export async function exportGrowthCampaigns(): Promise<{ csv: string } | { error: string }> {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const reading = await getGrowthReading()
  if (reading.state !== 'available') return { error: reading.message }
  return { csv: campaignCsv(reading.data) }
}

/** Explicit request only. Polling never incurs model cost, and the model cannot publish a change. */
// parse-ok: No client arguments; the brief uses only authenticated allowlisted server aggregates.
export async function draftGrowthBrief(): Promise<{ text: string; at: string; mode: 'ai' | 'rules' } | { error: string }> {
  const caller = await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const reading = await getGrowthReading()
  if (reading.state !== 'available') return { error: reading.message }
  const proposals = growthExperiments(reading.data)
  const fallback = proposals.length
    ? proposals.map((p) => `${p.title}. ${p.evidence} Hypothesis: ${p.hypothesis} Measure: ${p.primaryMetric} ${p.evaluation}`).join('\n\n')
    : 'There is not enough measured evidence to propose a change. Check event coverage and collect a baseline before choosing an experiment.'
  const at = reading.data.computedAt
  if (!aiEnabled() || proposals.length === 0) return { text: fallback, at, mode: 'rules' }
  try {
    const result = await completeText({
      accounting: { feature: 'growth-insights', profileId: caller.profileId },
      tier: 'haiku', maxTokens: 700,
      system: withVoice('Write a short operator brief using only the aggregate evidence below. Counts are observations, never causal evidence. Do not invent uplift, benchmarks, statistical significance, campaign names, or user behavior. State uncertainty and recommend at most one of the supplied experiment IDs, with a control, observation window, and guardrails. These are proposals only. Do not claim to have changed the site. Return plain text.'),
      messages: [{ role: 'user', content: JSON.stringify(growthAiEvidence(reading.data)) }],
    })
    return { text: result.text || fallback, at, mode: result.text ? 'ai' : 'rules' }
  } catch {
    return { text: fallback, at, mode: 'rules' }
  }
}
