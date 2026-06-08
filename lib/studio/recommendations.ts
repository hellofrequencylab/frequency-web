// AI Intelligence Studio — recommendation engine (PI.4 / ADR-167). Reads everything the
// PI track banked — the feature store + predictions, the interaction firehose rollups,
// the support tickets + help gaps — and names what to change, ranked, with evidence.
//
// Same grammar as the Engagement Read (lib/analytics/engagement-read.ts): the FINDINGS
// are DETERMINISTIC and grounded (real numbers), unit-testable. Claude only ever NARRATES
// the summary on top (graceful fallback to a deterministic line when AI is off/over
// budget). A recommendation may carry a registered, reversible `action` (the governed
// site-actions allow-list) that Admin/Janitor can apply with one click. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabledFlag } from '@/lib/platform-flags'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import type { SiteActionKey } from './site-actions'

export type Severity = 'good' | 'watch' | 'risk'

export interface StudioAction {
  key: SiteActionKey
  params: Record<string, unknown>
  label: string
}

export interface StudioRec {
  id: string
  severity: Severity
  category: 'support' | 'help' | 'ux' | 'retention' | 'ai'
  title: string
  /** Evidence — real numbers from the signal. */
  finding: string
  /** The concrete next move. */
  recommendation: string
  confidence: 'low' | 'medium' | 'high'
  /** Present when the move maps to a governed, one-click, reversible action. */
  action?: StudioAction
}

export interface StudioSignal {
  support: { open: number; urgent: number; unresolved: number }
  help: { deflected30: number; topUnanswered: { q: string; n: number }[]; chunks: number }
  surfaces: { surface: string; views: number; rageClicks: number; scrollAvg: number }[]
  retention: { members: number; highChurn: number }
  ai: { enabled: boolean }
}

export interface StudioRead {
  summary: string
  recs: StudioRec[]
  signal: StudioSignal
  aiNarrated: boolean
  generatedAt: string
}

const SEVERITY_RANK: Record<Severity, number> = { risk: 0, watch: 1, good: 2 }

/** Pure: turn the gathered signal into ranked, evidence-backed recommendations. */
export function synthesizeRecommendations(s: StudioSignal): StudioRec[] {
  const out: StudioRec[] = []

  // ── AI / help index health ────────────────────────────────────────────────
  if (s.ai.enabled && s.help.chunks === 0) {
    out.push({
      id: 'help_index_empty',
      severity: 'risk',
      category: 'ai',
      title: 'Help search has no index',
      finding: 'AI is on, but the help center has 0 indexed chunks — every help question deflects to a human.',
      recommendation: 'Re-index the help center so Vera can answer from the articles.',
      confidence: 'high',
      action: { key: 'reindex_help', params: {}, label: 'Re-index help' },
    })
  } else if (!s.ai.enabled) {
    out.push({
      id: 'ai_off',
      severity: 'watch',
      category: 'ai',
      title: 'AI assist is off',
      finding: 'The platform AI flag is disabled, so Vera, help search, and Studio narration run in deterministic mode.',
      recommendation: 'Turn AI on when you’re ready for live help answers and richer Studio summaries.',
      confidence: 'medium',
      action: { key: 'set_flag', params: { flag: 'ai_enabled', value: true }, label: 'Turn AI on' },
    })
  }

  // ── Help gaps — the to-write list (a strong "what's confusing" signal) ──────
  if (s.help.deflected30 >= 10) {
    const top = s.help.topUnanswered.slice(0, 3).map((t) => `“${t.q}” (${t.n}×)`).join(', ')
    out.push({
      id: 'help_gaps',
      severity: 'watch',
      category: 'help',
      title: 'Members keep asking things the help center can’t answer',
      finding: `${s.help.deflected30} deflected questions in 30 days. Top: ${top || '—'}.`,
      recommendation: 'Write help articles for the most-asked questions, then re-index.',
      confidence: 'high',
      action: { key: 'reindex_help', params: {}, label: 'Re-index help' },
    })
  }

  // ── Support backlog ─────────────────────────────────────────────────────────
  if (s.support.urgent > 0) {
    out.push({
      id: 'support_urgent',
      severity: 'risk',
      category: 'support',
      title: 'Urgent support tickets are open',
      finding: `${s.support.urgent} urgent ticket(s) unresolved (${s.support.open} open overall).`,
      recommendation: 'Triage the urgent tickets first; recurring themes are candidates for a site fix below.',
      confidence: 'high',
    })
  } else if (s.support.unresolved >= 8) {
    out.push({
      id: 'support_backlog',
      severity: 'watch',
      category: 'support',
      title: 'Support backlog is building',
      finding: `${s.support.unresolved} unresolved tickets.`,
      recommendation: 'Clear the backlog; cluster repeated reports into a single root-cause fix.',
      confidence: 'medium',
    })
  }

  // ── UX friction from the firehose — rage-clicks + shallow scroll ───────────
  const ragey = s.surfaces
    .filter((x) => x.rageClicks >= 3)
    .sort((a, b) => b.rageClicks - a.rageClicks)[0]
  if (ragey) {
    out.push({
      id: `ux_rage_${ragey.surface}`,
      severity: 'watch',
      category: 'ux',
      title: `Members are rage-clicking on "${ragey.surface}"`,
      finding: `${ragey.rageClicks} rapid repeat-click bursts on "${ragey.surface}" (${ragey.views} views).`,
      recommendation: 'Something there looks clickable but isn’t responding — check the controls/affordances on that surface.',
      confidence: 'medium',
    })
  }
  const skimmed = s.surfaces
    .filter((x) => x.views >= 20 && x.scrollAvg > 0 && x.scrollAvg < 25)
    .sort((a, b) => b.views - a.views)[0]
  if (skimmed) {
    out.push({
      id: `ux_scroll_${skimmed.surface}`,
      severity: 'watch',
      category: 'ux',
      title: `"${skimmed.surface}" barely gets read`,
      finding: `Avg scroll depth ${Math.round(skimmed.scrollAvg)}% across ${skimmed.views} views.`,
      recommendation: 'Move the value above the fold, or shorten — members leave before scrolling.',
      confidence: 'medium',
    })
  }

  // ── Retention — churn-risk cohort (PI.3 predictions) ───────────────────────
  if (s.retention.members > 0) {
    const share = s.retention.highChurn / s.retention.members
    if (s.retention.highChurn >= 3 && share >= 0.25) {
      out.push({
        id: 'retention_churn',
        severity: 'risk',
        category: 'retention',
        title: 'A churn-risk cohort is forming',
        finding: `${s.retention.highChurn} of ${s.retention.members} members (${Math.round(share * 100)}%) are high churn-risk.`,
        recommendation: 'Launch a win-back to the high-risk segment, and fix the friction the UX flags above point to.',
        confidence: 'medium',
      })
    }
  }

  if (out.length === 0) {
    out.push({
      id: 'all_clear',
      severity: 'good',
      category: 'ai',
      title: 'Nothing flagged',
      finding: 'Support, help coverage, on-site UX, and retention signals all look healthy right now.',
      recommendation: 'Keep banking signal — the Studio sharpens as more behavior accrues.',
      confidence: 'low',
    })
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/** Deterministic one-line read (the fallback when AI is off). */
export function deterministicSummary(recs: StudioRec[]): string {
  const risks = recs.filter((r) => r.severity === 'risk').length
  const watches = recs.filter((r) => r.severity === 'watch').length
  if (risks === 0 && watches === 0) return 'Everything looks healthy — nothing to change right now.'
  const parts: string[] = []
  if (risks) parts.push(`${risks} ${risks > 1 ? 'issues need' : 'issue needs'} attention`)
  if (watches) parts.push(`${watches} to watch`)
  return `${parts.join(', ')}. Start with the risks; applyable fixes are one click.`
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Gather the live signal from every banked source. Best-effort per source. */
export async function getStudioSignal(): Promise<StudioSignal> {
  const admin = db()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [tickets, helpQ, chunks, surfaceRes, churn, members, aiOn] = await Promise.all([
    admin.from('support_tickets').select('status, priority'),
    admin.from('ai_help_queries').select('question').eq('deflected', true).gte('created_at', since),
    admin.from('help_chunks').select('id', { count: 'exact', head: true }),
    admin.rpc('interaction_surface_stats', { _days: 30, _limit: 30 }),
    admin.from('member_traits').select('id', { count: 'exact', head: true }).eq('trait_key', 'churn_risk').eq('value_text', 'high'),
    admin.from('member_traits').select('profile_id', { count: 'exact', head: true }).eq('trait_key', 'churn_risk'),
    aiEnabledFlag(),
  ])

  const tRows = (tickets.data as { status: string; priority: string }[] | null) ?? []
  const unresolved = tRows.filter((t) => t.status !== 'resolved' && t.status !== 'closed')
  const open = tRows.filter((t) => t.status === 'open').length
  const urgent = unresolved.filter((t) => t.priority === 'urgent').length

  const qCounts = new Map<string, number>()
  for (const r of (helpQ.data as { question: string }[] | null) ?? []) {
    const q = (r.question ?? '').trim().slice(0, 120)
    if (q) qCounts.set(q, (qCounts.get(q) ?? 0) + 1)
  }
  const topUnanswered = [...qCounts.entries()]
    .map(([q, n]) => ({ q, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)

  const surfaces = ((surfaceRes.data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    surface: String(r.surface ?? ''),
    views: Number(r.views ?? 0),
    rageClicks: Number(r.rage_clicks ?? 0),
    scrollAvg: Number(r.scroll_avg ?? 0),
  }))

  return {
    support: { open, urgent, unresolved: unresolved.length },
    help: { deflected30: ((helpQ.data as unknown[]) ?? []).length, topUnanswered, chunks: chunks.count ?? 0 },
    surfaces,
    retention: { members: members.count ?? 0, highChurn: churn.count ?? 0 },
    ai: { enabled: aiOn },
  }
}

const STUDIO_SYSTEM = `You are the operator's analyst for a community platform. You will be given a JSON list of grounded, deterministic findings (each already has a severity, evidence, and a recommended action). Write a SHORT executive summary (2–3 sentences, plain and direct) that orients the operator: what matters most, and where to start. Do NOT invent new findings, numbers, or actions — only synthesize what's given. No preamble.`

/** The full read: deterministic recs + a summary that Claude narrates when available,
 *  falling back to a deterministic line otherwise. */
export async function getStudioRead(): Promise<StudioRead> {
  const signal = await getStudioSignal()
  const recs = synthesizeRecommendations(signal)
  const generatedAt = new Date().toISOString()

  // Claude narrates the summary only — findings + actions stay authoritative.
  if ((await aiAvailable()) && !(await featureOverBudget('studio'))) {
    try {
      const res = await completeText({
        system: STUDIO_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(recs.map((r) => ({ severity: r.severity, title: r.title, finding: r.finding, recommendation: r.recommendation }))) }],
        tier: 'haiku',
        maxTokens: 220,
        cacheSystem: true,
      })
      await recordAiUsage({ feature: 'studio', model: res.tier, usage: res.usage, costUsd: res.costUsd })
      if (res.text) return { summary: res.text, recs, signal, aiNarrated: true, generatedAt }
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) {
        // fall through to deterministic
      }
    }
  }

  return { summary: deterministicSummary(recs), recs, signal, aiNarrated: false, generatedAt }
}
