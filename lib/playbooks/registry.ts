// The Playbook Registry (Resonance Engine Phase 1 · ADR-382 · docs/NEXT-GEN-CRM.md
// "prediction -> playbook -> action"). The load-bearing seam that BINDS each prediction
// to exactly ONE governed, reversible action sequence — the missing half of the loop.
//
// This file is a DECLARATION, the same governance law as the trait registry
// (lib/traits/registry.ts): nothing exists without a declaration here. It is PURE —
// no IO, no mutation, no Supabase/Next imports — so it is trivially unit-testable and
// can be imported from a Server Component, a client surface, or a test alike.
//
// The join key is `next_best_action` (lib/traits/compute.ts emits
// reengage / activate / join_circle / deepen / invite / none), plus a `churn_risk`
// tier (low / medium / high). Adding a playbook is a registry entry here, NEVER a new
// mutation path — every action a playbook can take is one of Vera's already-governed,
// validated, audited tools (lib/ai/vera/tools.ts), executed only after the
// propose-and-confirm gate (lib/ai/vera/execute.ts).
//
// AUTONOMY IS GRADED, AND SUGGEST-BY-DEFAULT (the non-negotiable, brand-fatal-otherwise
// rule — resonate, do not extract):
//   • auto        — in-product, reversible only (a streak save, an in-feed surface).
//                   May execute optimistically with a visible Undo. NEVER outbound.
//   • suggest     — member-facing / outbound (an email, an invite). Vera DRAFTS,
//                   a human taps approve. Nothing sends on its own. The DEFAULT.
//   • never_auto  — billing / bulk / role. Explicit confirm, no batching by default.
// The structural defense lives in the type system below: an action with an outbound
// channel can never sit in an `auto` playbook (validated by the unit test), and the
// Today orchestrator + execute path both honor the tier.

import type { ChurnRisk, NextBestAction } from '@/lib/traits/compute'

/** The autonomy grade of a whole playbook. Suggest-by-default; auto is the exception,
 *  reserved for in-product reversible moves; never_auto is billing/bulk/role. */
export type AutonomyTier = 'auto' | 'suggest' | 'never_auto'

/** The governed tools a playbook action may invoke. EXACTLY the write tools registered
 *  in lib/ai/vera/tools.ts that Phase 1 adds — the registry can never name a tool the
 *  allow-list does not also know, so there is one source of truth for "what may fire". */
export type PlaybookActionTool =
  | 'save_streak'        // in-product, reversible (auto-eligible)
  | 'tag_contact'        // in-product label, reversible
  | 'move_contact_stage' // in-product CRM stage move, reversible
  | 'give_gem_gift'      // in-product, member-affecting GIFT: a modest retroactive Gem grant (ADR-386)
  | 'send_playbook_email' // OUTBOUND, member-facing — suggest only, NEVER auto

/** Whether an action reaches a MEMBER (outbound) or stays IN-PRODUCT. The single fact
 *  that decides whether an action may live in an `auto` playbook. */
export type ActionSurface = 'in_product' | 'outbound'

/** One step in a playbook's governed sequence. A pure descriptor — it names a tool and
 *  its surface; the actual execution is the existing confirm-then-execute path. */
export interface PlaybookAction {
  /** The governed tool this step invokes (must be in the Vera allow-list). */
  tool: PlaybookActionTool
  /** Where the step lands. `outbound` steps are draft-and-approve, never auto. */
  surface: ActionSurface
  /** A short, plain label for the step (operator-facing; in voice, no dashes). */
  label: string
}

/** What FIRES a playbook. Phase 1 wired the two prediction signals (next_best_action +
 *  churn_risk tier); Phase 5 (ADR-386) adds `failed_payment` — a billing webhook signal,
 *  NOT a prediction trait, so it sits beside the prediction triggers as its own kind. A
 *  failed-payment trigger keys the dunning sequence. */
export type PlaybookTrigger =
  | { kind: 'next_best_action'; value: NextBestAction }
  | { kind: 'churn_risk'; value: ChurnRisk }
  | { kind: 'failed_payment' }

/** A governed action-sequence descriptor — the registry's unit. */
export interface Playbook {
  /** Stable slug id (storage + audit key; matches the `playbooks` table id later). */
  id: string
  /** Operator-facing name, in voice. */
  name: string
  /** One plain line: what this playbook is for + why now. No dashes. */
  rationale: string
  /** The prediction signal that selects this playbook. */
  trigger: PlaybookTrigger
  /** The ordered, governed steps. Every tool is in the Vera allow-list. */
  actions: PlaybookAction[]
  /** The autonomy grade for the whole sequence (see the law at the top of file). */
  autonomyTier: AutonomyTier
}

const inProduct = (tool: Exclude<PlaybookActionTool, 'send_playbook_email'>, label: string): PlaybookAction => ({
  tool,
  surface: 'in_product',
  label,
})
const outbound = (label: string): PlaybookAction => ({ tool: 'send_playbook_email', surface: 'outbound', label })

// ── The registry. One entry per next_best_action value + the three churn_risk tiers.
// Mirrors the prediction-to-playbook map in docs/NEXT-GEN-CRM.md, fail-closed:
//   • the ONLY auto playbook is the in-product streak save (reversible, no member touch);
//   • every member-facing sequence is suggest (drafted, a human approves);
//   • `none` maps to a no-op suggest playbook so EVERY value resolves (no silent gap).

export const PLAYBOOK_REGISTRY: readonly Playbook[] = [
  // ── next_best_action ────────────────────────────────────────────────────────
  {
    id: 'reengage_winback',
    name: 'Winback',
    rationale:
      'Their practice cadence is falling (high decline_slope) and the model says reengage. Lead with value, not a discount: a Journey in their Pillar, a "your Circle missed you" note, a small Gem gift. A price nudge waits for the end of the sequence.',
    trigger: { kind: 'next_best_action', value: 'reengage' },
    actions: [
      inProduct('tag_contact', 'Tag them as cooling so the next pass knows'),
      inProduct('give_gem_gift', 'Gift a small handful of Gems, a welcome back not a bribe'),
      outbound('Draft a value-led note: a new Journey in their Pillar, or that their Circle missed them'),
    ],
    autonomyTier: 'suggest',
  },
  {
    id: 'activate_onboarding_nudge',
    name: 'Activation nudge',
    rationale: 'They joined but have not done a first Practice. Draft the one warm first-week touch.',
    trigger: { kind: 'next_best_action', value: 'activate' },
    actions: [outbound('Draft a first-week nudge toward a first Practice')],
    autonomyTier: 'suggest',
  },
  {
    id: 'join_circle_invite',
    name: 'Circle invite',
    rationale: 'They are present but light. Draft an invite to a Circle that fits, to anchor them.',
    trigger: { kind: 'next_best_action', value: 'join_circle' },
    actions: [outbound('Draft an invite to a Circle that fits them')],
    autonomyTier: 'suggest',
  },
  {
    id: 'deepen_widen_use',
    name: 'Deepen',
    rationale: 'Active but narrow. Draft a nudge toward a second Pillar or a new Journey.',
    trigger: { kind: 'next_best_action', value: 'deepen' },
    actions: [
      inProduct('tag_contact', 'Tag them ready-to-deepen'),
      outbound('Draft a nudge toward something new to try'),
    ],
    autonomyTier: 'suggest',
  },
  {
    id: 'invite_advocacy',
    name: 'Advocacy',
    rationale: 'A power member. Draft an ask to host a Circle or bring a friend.',
    trigger: { kind: 'next_best_action', value: 'invite' },
    actions: [
      inProduct('move_contact_stage', 'Move them to the advocate stage'),
      outbound('Draft an ask to host or refer a friend'),
    ],
    autonomyTier: 'suggest',
  },
  {
    id: 'none_no_op',
    name: 'Steady',
    rationale: 'Nothing needs doing here right now. Leave them be.',
    trigger: { kind: 'next_best_action', value: 'none' },
    actions: [],
    autonomyTier: 'suggest',
  },

  // ── churn_risk tier ─────────────────────────────────────────────────────────
  // The high tier is the highest-ROI play: the in-product, reversible streak save —
  // the ONLY auto-eligible playbook (no member touch, fully undoable).
  {
    id: 'churn_high_streak_save',
    name: 'Streak save',
    rationale: 'Their streak breaks soon. Save it with a freeze. In-product and reversible.',
    trigger: { kind: 'churn_risk', value: 'high' },
    actions: [inProduct('save_streak', 'Save their streak with a freeze')],
    autonomyTier: 'auto',
  },
  {
    id: 'churn_medium_check_in',
    name: 'Check in',
    rationale: 'Slipping but not gone. Draft a light check-in.',
    trigger: { kind: 'churn_risk', value: 'medium' },
    actions: [outbound('Draft a light check-in note')],
    autonomyTier: 'suggest',
  },
  {
    id: 'churn_low_steady',
    name: 'Steady',
    rationale: 'Healthy. No action needed.',
    trigger: { kind: 'churn_risk', value: 'low' },
    actions: [],
    autonomyTier: 'suggest',
  },

  // ── failed_payment (Resonance Engine Phase 5 · ADR-386) ──────────────────────
  // Dunning: a warm 72h note tied to what they would LOSE (a streak, a Circle), not a
  // threat. The note is OUTBOUND, so it is suggest-only and passes the send-gate; nothing
  // auto-sends. Stripe's own Smart Retries + card updater run first (outside this registry);
  // this is the human-shaped leg, drafted and approved.
  {
    id: 'failed_payment_dunning',
    name: 'Dunning',
    rationale:
      'A payment failed. After the automatic retries, send one warm note within 72 hours, framed around what they would lose (their streak, their Circle), never a threat. Suggest only.',
    trigger: { kind: 'failed_payment' },
    actions: [
      inProduct('tag_contact', 'Tag them as a payment that needs a hand'),
      outbound('Draft a warm 72h note tied to what they would lose, not a threat'),
    ],
    autonomyTier: 'suggest',
  },
] as const

// ── Lookups (pure; no IO) ──────────────────────────────────────────────────────

const BY_NEXT_BEST_ACTION = new Map<NextBestAction, Playbook>(
  PLAYBOOK_REGISTRY.filter((p) => p.trigger.kind === 'next_best_action').map((p) => [
    (p.trigger as { kind: 'next_best_action'; value: NextBestAction }).value,
    p,
  ]),
)

const BY_CHURN_RISK = new Map<ChurnRisk, Playbook>(
  PLAYBOOK_REGISTRY.filter((p) => p.trigger.kind === 'churn_risk').map((p) => [
    (p.trigger as { kind: 'churn_risk'; value: ChurnRisk }).value,
    p,
  ]),
)

const FAILED_PAYMENT_PLAYBOOK: Playbook | undefined = PLAYBOOK_REGISTRY.find(
  (p) => p.trigger.kind === 'failed_payment',
)

const BY_ID = new Map<string, Playbook>(PLAYBOOK_REGISTRY.map((p) => [p.id, p]))

/** The playbook bound to a next_best_action value. Total over the enum (every value is
 *  declared), so this never returns undefined for a known value. */
export function playbookForNextBestAction(value: NextBestAction): Playbook | undefined {
  return BY_NEXT_BEST_ACTION.get(value)
}

/** The playbook bound to a churn_risk tier. Total over the enum. */
export function playbookForChurnRisk(value: ChurnRisk): Playbook | undefined {
  return BY_CHURN_RISK.get(value)
}

/** The dunning playbook bound to the failed-payment signal (Resonance Engine Phase 5 ·
 *  ADR-386). A single playbook, not enumerated, so this returns the one or undefined. */
export function playbookForFailedPayment(): Playbook | undefined {
  return FAILED_PAYMENT_PLAYBOOK
}

/** Look up a playbook by its stable id (audit / run lookups). */
export function getPlaybook(id: string): Playbook | undefined {
  return BY_ID.get(id)
}

/** True when every step of a playbook stays in-product (no outbound surface). The
 *  structural precondition for an `auto` tier — enforced by the unit test. */
export function isFullyInProduct(p: Playbook): boolean {
  return p.actions.every((a) => a.surface === 'in_product')
}

// ── Effective autonomy under the per-Space slider (Resonance Engine Phase 3 · ADR-384) ──────────
// The registry declares each playbook's DESIGN tier; the per-Space autonomy slider decides the
// EFFECTIVE tier at run time. The single, pure decision both the Today path and the execute path
// share, so they can never disagree on whether a playbook auto-runs.

/** The effective autonomy tier of a playbook GIVEN whether the Space allows auto-execution. PURE.
 *  When the Space is `suggest_only` (the default, `autoAllowed === false`), even a designed-`auto`
 *  playbook is DOWNGRADED to `suggest` (a human approves; nothing auto-executes). When the Space is
 *  `safe_auto` (`autoAllowed === true`), the design tier stands. `never_auto` is never raised; an
 *  outbound `suggest` is never lowered. Member-facing/outbound is never auto regardless (the registry
 *  type already forbids an outbound action inside an `auto` playbook). */
export function effectiveAutonomyTier(tier: AutonomyTier, autoAllowed: boolean): AutonomyTier {
  if (tier === 'auto' && !autoAllowed) return 'suggest'
  return tier
}

/** True when a playbook would actually AUTO-EXECUTE for a Space with this auto-allowance. PURE.
 *  Only a designed-`auto` playbook in a `safe_auto` Space auto-runs; everything else is a Suggest. */
export function willAutoExecute(p: Playbook, autoAllowed: boolean): boolean {
  return effectiveAutonomyTier(p.autonomyTier, autoAllowed) === 'auto'
}
