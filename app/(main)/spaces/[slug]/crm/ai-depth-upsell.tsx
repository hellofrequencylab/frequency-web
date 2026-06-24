import Link from 'next/link'
import { Sparkles, TrendingUp, Users } from 'lucide-react'
import { type AiDepthTier } from '@/lib/spaces/entitlements'
import { getSpaceOutcomeUsage } from '@/lib/spaces/ai-usage'

// AI-DEPTH UPSELL (Resonance Engine Phase 6 · ADR-387). A tasteful, in-context card on the Space CRM
// cockpit that appears ONLY when a free / lower Space reaches an AI-depth ceiling: it has run a
// useful amount of the engine and is ready for the deeper, governed automation (auto-execution, the
// Resonance Graph). Framed as BELONGING and what the room gets next, never a shakedown.
//
// DISPLAY-ONLY (ADR-387): this reads the Space's resolved AI-depth tier + its fail-safe outcome usage
// and renders a link to the Space's own billing surface. It NEVER charges and NEVER auto-changes a
// plan. A degraded usage read renders nothing (the read fails safe to "no ceiling"), so a hiccup
// never nags an operator. The caller renders this only inside the canUseCrm gate (owner/admin), so
// it is never shown to a member or a non-operator.
//
// Self-contained block: the Space cockpit page mounts <AiDepthUpsell /> behind its own Suspense; this
// component owns its own reads, so it can be added / removed without touching the rest of the board
// (a sibling Phase 4 section can sit beside it with no conflict). Semantic tokens only, no hardcoded
// hex. Copy in voice (CONTENT-VOICE §10): plain sentences, a concrete number, no em or en dashes.

/** What the NEXT rung of depth offers, keyed by the Space's current tier. Null = already at the top
 *  (no upsell). Copy is value-led: what the room gets, with a concrete promise, never a price pitch. */
const NEXT_RUNG: Record<AiDepthTier, { title: string; line: string; cta: string } | null> = {
  wedge: {
    title: 'Let the engine run the safe moves for you',
    line: 'You are clearing your Today cards by hand. The next plan lets Vera run the reversible moves on its own, like saving a streak, so the small saves happen without you. You still approve every message that reaches a member.',
    cta: 'See what your plan unlocks',
  },
  playbooks: {
    title: 'See who in your room should meet',
    line: 'You have the playbooks working. The next plan adds the resonance view: who is close by with your vibe, and who is quietly going dormant before they leave. It turns your contacts into a map of the room.',
    cta: 'See what your plan unlocks',
  },
  resonance: {
    title: 'Open the full Resonance Graph',
    line: 'You can see the resonance view. The top plan adds predictive alerts and managed matching: warm, double opt-in intros and Circle seeds drawn from the whole graph, so the right people meet without you working the list.',
    cta: 'See what your plan unlocks',
  },
  resonance_ai: null, // already at the top rung; nothing to upsell
}

/** The Space cockpit AI-depth upsell. Renders nothing unless the Space is below the top rung AND has
 *  reached its soft outcome ceiling (it is actually using the engine), so the nudge only ever lands
 *  when it is genuinely useful. Fail-safe to rendering nothing. The page resolves the Space (with the
 *  real viewer) and hands down the already-derived `tier` + `plan`, so this never re-resolves the
 *  Space (no private-space visibility pitfall, no extra read). */
export async function AiDepthUpsell({
  slug,
  spaceId,
  tier,
  plan,
}: {
  slug: string
  spaceId: string
  tier: AiDepthTier
  plan: string | null | undefined
}) {
  const next = NEXT_RUNG[tier]
  if (!next) return null // already at the top rung: no ceiling to hit

  // Only nudge when the Space is actually working the engine and has hit its soft volume ceiling. A
  // degraded read returns atCeiling=false, so a hiccup never nags. The free wedge's ceiling is low
  // enough that an engaged Space reaches it; a quiet Space never sees this.
  const usage = await getSpaceOutcomeUsage(spaceId, plan)
  if (usage.degraded || !usage.atCeiling) return null

  const used = usage.playbookActions
  const Icon = tier === 'wedge' ? Sparkles : tier === 'playbooks' ? Users : TrendingUp

  return (
    <section
      aria-labelledby="ai-depth-upsell-heading"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[16rem]">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-strong">
            <Icon className="h-3.5 w-3.5" aria-hidden /> Your engine is ready for more
          </p>
          <h3 id="ai-depth-upsell-heading" className="mt-1.5 text-base font-semibold text-text">
            {next.title}
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted">{next.line}</p>
          <p className="mt-2 text-2xs text-subtle">
            You have run {used.toLocaleString()} engine actions for your room this month.
          </p>
        </div>
        <Link
          href={`/spaces/${slug}/settings/billing`}
          className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          {next.cta}
        </Link>
      </div>
    </section>
  )
}
