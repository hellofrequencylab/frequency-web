// "The Engagement Read" — the product/retention twin of the Market Read (ADR-070
// Phase D). It reads the live engagement signal (the dashboard + outcome read-models)
// and names what's working, what's jamming, and what to do about it — for the janitor.
//
// PROTOTYPE NOTE: synthesis is DETERMINISTIC (same convention as lib/marketing/
// market-read.ts and the winback proposer). A live Claude narration slots in behind
// `summarize()` once the AI core is enabled — the insight *findings* stay deterministic
// and grounded; the model only ever narrates them. Server-only.

import { getEngagementDashboard } from './dashboard'
import { getOutcomeReport } from './outcomes'
import { getShowingUpReading } from './showing-up'

export type Severity = 'good' | 'watch' | 'risk'

export interface Insight {
  id: string
  severity: Severity
  title: string
  /** Evidence — real numbers. */
  finding: string
  /** The concrete next move. */
  recommendation: string
}

export interface ReadInput {
  showingUpMembers: number | null
  newMembers: number
  /** 0..1 */
  activationRate: number
  funnel: Array<{ step: string; actors: number; dropPct: number | null; orderedCohort?: boolean }>
  challenges: Array<{ name: string; started: number; completed: number; rate: number | null }>
  quests: Array<{ name: string; started: number; rate: number | null; avgStallStep: number | null }>
}

interface EngagementRead {
  summary: string
  insights: Insight[]
  generatedAt: string
}

const SEVERITY_RANK: Record<Severity, number> = { risk: 0, watch: 1, good: 2 }
const LOW_COMPLETION = 25
const MIN_STARTS = 3

/** Pure: turn the engagement signal into ranked insights. Unit-tested. */
export function synthesizeInsights(input: ReadInput): Insight[] {
  const out: Insight[] = []

  // Activation — the leading retention indicator (ADR-024).
  const actPct = Math.round(input.activationRate * 100)
  if (input.newMembers >= MIN_STARTS && input.activationRate < 0.3) {
    out.push({
      id: 'activation_low',
      severity: 'risk',
      title: 'Activation is low',
      finding: `Only ${actPct}% of ${input.newMembers} recent members hit their first verified practice.`,
      recommendation: 'Shorten the path to a first practice — surface one adoptable practice in onboarding and the feed.',
    })
  } else if (input.newMembers >= MIN_STARTS && input.activationRate >= 0.5) {
    out.push({
      id: 'activation_good',
      severity: 'good',
      title: 'Activation is healthy',
      finding: `${actPct}% of ${input.newMembers} recent members activated.`,
      recommendation: 'Hold the onboarding path; watch that it scales as volume grows.',
    })
  }

  // Host-confirmed attendance is the north star. Missing is distinct from zero.
  if (input.showingUpMembers === 0) {
    out.push({
      id: 'attendance_zero',
      severity: 'risk',
      title: 'No host-confirmed attendance this week',
      finding: 'No Members were marked present by a host in the last 7 days.',
      recommendation: 'Check host marking coverage, then help members reach a gathering.',
    })
  }

  // Funnel — where navigation jams (biggest step-over-step drop).
  const worstDrop = input.funnel
    .filter((s) => s.orderedCohort && s.dropPct !== null && s.dropPct > 0 && s.actors >= 0)
    .sort((a, b) => (b.dropPct ?? 0) - (a.dropPct ?? 0))[0]
  if (worstDrop && (worstDrop.dropPct ?? 0) >= 40) {
    out.push({
      id: 'funnel_jam',
      severity: 'watch',
      title: `Members jam before "${worstDrop.step}"`,
      finding: `${worstDrop.dropPct}% drop reaching "${worstDrop.step}".`,
      recommendation: `Smooth the step into "${worstDrop.step}" — reduce friction or add a nudge there.`,
    })
  }

  // Programs that aren't landing — low completion with real starts.
  const stalled = [
    ...input.challenges.map((c) => ({ kind: 'challenge', name: c.name, started: c.started, rate: c.rate })),
    ...input.quests.map((q) => ({ kind: 'quest', name: q.name, started: q.started, rate: q.rate })),
  ].filter((p) => p.rate !== null && p.rate < LOW_COMPLETION && p.started >= MIN_STARTS)
  for (const p of stalled.slice(0, 3)) {
    out.push({
      id: `program_${p.kind}_${p.name}`,
      severity: 'risk',
      title: `"${p.name}" isn't landing`,
      finding: `${p.started} started, ${p.rate}% completed.`,
      recommendation: 'Revisit the ask — is the difficulty, clarity, or reward off? Talk to someone who stalled.',
    })
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/** Pure: a deterministic one-line read. Live Claude narration slots in here later. */
export function summarize(insights: Insight[]): string {
  const risks = insights.filter((i) => i.severity === 'risk').length
  const watches = insights.filter((i) => i.severity === 'watch').length
  if (risks === 0 && watches === 0) return 'No rule-based concerns met the evidence threshold. This does not establish that every flow is healthy.'
  const parts: string[] = []
  if (risks) parts.push(`${risks} thing${risks > 1 ? 's' : ''} need${risks > 1 ? '' : 's'} attention`)
  if (watches) parts.push(`${watches} to watch`)
  return `${parts.join(', ')}. Start with the risks below.`
}

export async function getEngagementRead(): Promise<EngagementRead> {
  const [dash, outcomes, attendance] = await Promise.all([
    getEngagementDashboard(30).catch(() => null), getOutcomeReport().catch(() => null), getShowingUpReading(),
  ])
  if (!dash || !outcomes) return { summary: 'A required reading is unavailable. No reliable engagement recommendation can be made.', insights: [], generatedAt: new Date().toISOString() }
  const input: ReadInput = {
    showingUpMembers: attendance?.members ?? null,
    newMembers: dash.practice.newMembers,
    activationRate: dash.practice.activationRate,
    funnel: dash.funnel.map((f) => ({ step: f.step, actors: f.actors, dropPct: f.dropPct })),
    challenges: outcomes.challenges.map((c) => ({ name: c.name, started: c.started, completed: c.completed, rate: c.rate })),
    quests: outcomes.quests.map((q) => ({ name: q.name, started: q.started, rate: q.rate, avgStallStep: q.avgStallStep })),
  }
  const insights = synthesizeInsights(input)
  return { summary: summarize(insights), insights, generatedAt: new Date().toISOString() }
}
