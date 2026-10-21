// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE CREATION WIZARD'S RULES (the seeders analysis, 2026-10-21). PURE and client-safe.
//
// Same shape as lib/spaces/setup.ts: the steps are read off the Space manifest's own sections, and
// the steps the manifest cannot declare (what the owner wants to do here, a tracking signal rather than a
// Space field, and the closing summary) are added beside it, never in place of it.
//
//   What you want to do  ->  Tool setup (manifest `model`)  ->  Name and handle (`identity`)  ->  Start
//
// THE PICKS are a multi-select over what the Space can do, never a niche: nobody is asked to be one
// kind of business up front. They suggest a starting setup and are recorded FIRST-PARTY ONLY (the
// engagement ledger, never an ad pixel; persona and topic data stay out of every pixel).
//
// The PLAN is a HINT, never a grant. A Space is always born on the free plan (createSpace); a paid
// plan only changes where the owner lands once the setup walk is done: the Space's billing page,
// where the real checkout lives. /pricing hands the hint over as `?plan=<id>` (operatorStartHref).
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest } from '@/lib/studio/kernel/manifest'
import { asSpacePlan, SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'

/** The plans /pricing sells a Space on, in the order the wizard offers them. */
export const WIZARD_PLANS = ['free', 'business', 'collective', 'nonprofit', 'network'] as const
export type WizardPlan = (typeof WIZARD_PLANS)[number]

/** One plain line per plan. No prices here: the price lives on /pricing and the billing page. */
export const WIZARD_PLAN_COPY: Record<WizardPlan, { label: string; hint: string }> = {
  free: { label: SPACE_PLAN_LABEL.free, hint: 'Start free. Upgrade any time.' },
  business: { label: SPACE_PLAN_LABEL.business, hint: 'For one business or practice.' },
  collective: { label: SPACE_PLAN_LABEL.collective, hint: 'For groups of groups that work together.' },
  nonprofit: { label: SPACE_PLAN_LABEL.nonprofit, hint: 'The Business toolkit, for verified nonprofits.' },
  network: { label: SPACE_PLAN_LABEL.network, hint: 'One owner running many chapters.' },
}

/** Read `?plan=` leniently. Unknown, missing or a legacy label means free; it can never 404. PURE. */
export function parsePlanHint(raw: string | string[] | null | undefined): WizardPlan {
  const one = Array.isArray(raw) ? raw[0] : raw
  const plan: SpacePlan = asSpacePlan(one)
  return (WIZARD_PLANS as readonly string[]).includes(plan) ? (plan as WizardPlan) : 'free'
}

/** Whether a plan hint means the owner wants to pay (so billing follows the setup walk). */
export function planWantsBilling(plan: string | null | undefined): boolean {
  const p = parsePlanHint(plan ?? undefined)
  return p !== 'free'
}

/** The "what do you run?" choice a plan points at, when it points at one. A nonprofit plan is the
 *  nonprofit Mode; the others leave the choice to the owner. PURE. */
export function choiceTypeForPlan(plan: WizardPlan): 'nonprofit' | null {
  return plan === 'nonprofit' ? 'nonprofit' : null
}

/** Where the setup walk finishes. A paid-plan hint ends on the Space's billing page; otherwise it is
 *  LIVE-261's landing, the Circles manager. `finish` is the default the caller already computed. */
export function setupFinishFor(slug: string, plan: string | null | undefined, finish: string): string {
  return planWantsBilling(plan) ? `/spaces/${slug}/settings/billing?plan=${parsePlanHint(plan ?? undefined)}` : finish
}

type CreateWizardStepKey = 'plan' | 'model' | 'identity' | 'start'

interface CreateWizardStep {
  key: CreateWizardStepKey
  title: string
  desc: string
}

const STEP_COPY: Record<CreateWizardStepKey, { title: string; desc: string }> = {
  intents: { title: 'What do you want to do here?', desc: 'Pick everything that fits, or skip it. You are not choosing a niche, and you can add more any time.' },
  model: { title: 'How should we set up your tools?', desc: 'We start you with the tools that fit your picks. Not sure? Leave it on the general choice. You can switch it later.' },
  identity: { title: 'Name it', desc: 'The name people will see across the network, and the handle it lives at.' },
  start: { title: 'Ready to start', desc: 'Here is what we will set up. Then we walk you through your story, look, and offerings.' },
}

/** The steps, from the manifest: `model` and `identity` are dropped if the manifest stops declaring
 *  them; `plan` and `start` are the wizard's own and always present. PURE. */
export function createWizardSteps(manifest: EntityManifest): CreateWizardStep[] {
  const declared = new Set(manifest.sections.map((s) => s.key))
  const keys: CreateWizardStepKey[] = ['intents']
  if (declared.has('model')) keys.push('model')
  if (declared.has('identity')) keys.push('identity')
  keys.push('start')
  return keys.map((key) => ({ key, ...STEP_COPY[key] }))
}

/** What an owner can say they want to do here. One entry per thing the product offers; the `mode` is the
 *  starting setup that fits it (a `${type}:${variant}` ModeChoice id), or null when it needs none. */
export const WIZARD_INTENTS = [
  { id: 'bookings', label: 'Take bookings', hint: '1:1 sessions and appointments', mode: 'business:appointments' },
  { id: 'classes', label: 'Run classes or memberships', hint: 'A studio, gym, or recurring group', mode: 'business:membership' },
  { id: 'programs', label: 'Teach programs or courses', hint: 'Cohorts, courses, and journeys', mode: 'business:cohort' },
  { id: 'events', label: 'Host events', hint: 'Workshops, gatherings, ticketed nights', mode: 'business:ticketed' },
  { id: 'products', label: 'Sell products', hint: 'A catalog and a storefront', mode: 'business:product' },
  { id: 'community', label: 'Build a community', hint: 'Circles for your people', mode: null },
  { id: 'email', label: 'Stay in touch by email', hint: 'Newsletters and follow ups', mode: null },
  { id: 'donations', label: 'Raise donations', hint: 'A nonprofit with programs', mode: 'nonprofit:donations' },
] as const

type WizardIntentId = (typeof WIZARD_INTENTS)[number]['id']


/** Keep only known picks, deduped, in catalog order. Total: anything else is dropped. PURE. */
export function parseIntents(raw: unknown): WizardIntentId[] {
  const asked = new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])
  return WIZARD_INTENTS.filter((i) => asked.has(i.id)).map((i) => i.id)
}

/** The starting setup a set of picks points at: the first pick in catalog order that has one, but a
 *  donations pick wins (it is the only nonprofit setup). Null means "no opinion", so the caller keeps
 *  its general default. PURE. */
export function suggestModeForIntents(picks: readonly string[], available: readonly string[]): string | null {
  const chosen = parseIntents(picks)
  const order: WizardIntentId[] = chosen.includes('donations') ? ['donations'] : chosen
  for (const id of order) {
    const mode = WIZARD_INTENTS.find((i) => i.id === id)?.mode
    if (mode && available.includes(mode)) return mode
  }
  return null
}
