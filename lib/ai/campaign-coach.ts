// Vera's campaign coach (Email Studio) — an ADMIN analysis surface. Given ONE sent campaign's real
// engagement numbers, Vera writes a short, grounded read on how to lift the OPEN RATE next time
// (subject line, preheader, send time, from-name, list hygiene). It never sends anything and never
// messages a member; it returns text the operator reads inside the campaign's expanded stats row.
//
// Budget: gated by the platform AI switch + this feature's own daily cap (like creator-tips /
// support-draft), never a member budget. Server-only; the action layer gates the caller (marketing).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignMetrics } from '@/lib/email-studio/analytics'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { completeText, AiUnavailableError } from './complete'
import { withVoice } from './voice'

const FEATURE = 'campaign-coach'

/** The result of a coaching run. `analysis` is present only when Vera actually wrote one; otherwise
 *  `reason` explains why (no send yet, legacy send with no engagement data, or AI unavailable). */
export interface CampaignCoachResult {
  ok: boolean
  analysis?: string
  reason?: string
}

const COACH_SYSTEM = `You are Vera, the Frequency guide, giving an email operator a short, practical read on how to improve the OPEN RATE of their next send. You are handed ONE campaign's real numbers; ground every point in those exact numbers (never invent or inflate them). Structure: one sentence on how this send did, then 3 to 4 concrete, doable suggestions to lift opens next time, drawn from the levers that actually move open rate: the subject line, the preheader, the from-name, the send day/time, and list hygiene (bounces/complaints). If clicks are healthy but opens look low, note that opens are approximate (Apple Mail privacy inflates them) and to weight clicks. Keep it plain and skimmable: a lead sentence then short dashless bullets, each starting with a verb. Never use an em dash; use a period or comma. Do not greet or sign off. Output ONLY the analysis.`

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

/**
 * Analyze one campaign's engagement and return Vera's open-rate coaching. FAIL-SOFT: returns
 * `{ ok:false, reason }` for an unsent / legacy campaign or when AI is off/over-budget, so the caller
 * shows a plain message instead of an error.
 */
export async function analyzeCampaignOpenRate(campaignId: string, actorId?: string): Promise<CampaignCoachResult> {
  const metrics = await getCampaignMetrics(campaignId)
  if (!metrics.hasSent) return { ok: false, reason: 'This campaign has not sent yet, so there is nothing to analyze.' }
  if (metrics.attributionMode === 'legacy') {
    return { ok: false, reason: 'This send predates open and click tracking. Your next send will have full stats to analyze.' }
  }

  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    return { ok: false, reason: 'Vera analysis is off or over budget for today. The stats above are still live.' }
  }

  // Pull the levers Vera reasons over (subject, preheader, from-name, audience). Fail-soft to blanks.
  let subject = ''
  let preheader = ''
  let fromName = ''
  let segment = ''
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('campaigns')
      .select('subject, preheader, from_name, segment')
      .eq('id', campaignId)
      .maybeSingle()
    const row = data as { subject?: string; preheader?: string; from_name?: string; segment?: string } | null
    subject = row?.subject ?? ''
    preheader = row?.preheader ?? ''
    fromName = row?.from_name ?? ''
    segment = row?.segment ?? ''
  } catch {
    /* levers stay blank; the numbers below are enough for a useful read */
  }

  const evidence = [
    `Subject: ${subject || '(none)'}`,
    `Preheader: ${preheader || '(none)'}`,
    `From name: ${fromName || '(default)'}`,
    `Audience: ${segment || '(unknown)'}`,
    `Delivered: ${metrics.delivered}`,
    `Open rate: ${pct(metrics.openRate)} (${metrics.opened} opens)`,
    `Click rate: ${pct(metrics.clickRate)} (${metrics.clicked} clicks)`,
    `Bounce rate: ${pct(metrics.bounceRate)} (${metrics.bounced} bounced)`,
    `Unsubscribes: ${metrics.unsubscribed}`,
    `Spam complaints: ${metrics.complained}`,
  ].join('\n')

  try {
    const res = await completeText({
      system: withVoice(COACH_SYSTEM),
      messages: [
        { role: 'user', content: `CAMPAIGN NUMBERS (the only facts you may use):\n${evidence}\n\nWrite the open-rate analysis.` },
      ],
      tier: 'haiku',
      maxTokens: 400,
    })
    await recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: actorId })
    const text = res.text.trim()
    if (!text) return { ok: false, reason: 'Vera could not draft an analysis this time. Try again in a moment.' }
    return { ok: true, analysis: text }
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return { ok: false, reason: 'Vera analysis is off or over budget for today. The stats above are still live.' }
    }
    return { ok: false, reason: 'Vera could not draft an analysis this time. Try again in a moment.' }
  }
}
