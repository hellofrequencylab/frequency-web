// The walkthrough MODEL — unions, labels, and the blank-draft builders. No database.
//
// Split out of lib/walkthroughs.ts (LIVE-037). The best-effort reads there open the service-role
// admin client; the slide editor only ever needed this half. They shared a module, so
// admin/walkthroughs/[id]/editor.tsx ('use client') importing AVAILABLE_TRIGGERS and blankStep
// pulled the RLS-bypassing Supabase client into the editor's browser bundle.
//
// Everything here is re-exported from lib/walkthroughs.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

import { ONBOARDING_CRITERIA, type OnboardingStepKey } from '@/lib/onboarding/steps'

// ── Unions (mirror the migration's CHECK constraints) ───────────────────────────

export type WalkthroughTrigger =
  | 'manual'
  | 'new_member'
  | 'role_host'
  | 'role_guide'
  | 'role_mentor'
  | 'circle_lead'
  | 'season'
  | 'project'

export type WalkthroughCadence = 'once' | 'per_session' | 'daily' | 'until_done'

export type StepLayout = 'centered' | 'media-top' | 'split'

/** Semantic accent token KEYS the slide editor offers as swatches — never a raw hex.
 *  Each maps to a `--color-*` / `--rank-*` token in app/globals.css. */
export type StepAccent =
  | 'primary'
  | 'signal'
  | 'broadcast'
  | 'success'
  | 'warning'
  | 'rank-gold'
  | 'rank-jade'
  | 'rank-teal'
  | 'rank-indigo'
  | 'rank-plum'
  | 'rank-rose'

/** One slide of a walkthrough — the shape stored in the `steps` jsonb array. */
export interface WalkthroughStep {
  /** Stable client id (slide reorder/select key); not a DB row. */
  id: string
  title: string
  body: string
  /** Optional hero/illustration URL (used by the 'media-top' and 'split' layouts). */
  mediaUrl?: string
  /** Optional lucide icon name (see STEP_ICONS in the editor). */
  icon?: string
  /** Semantic accent token key — drives the slide's color, never a raw hex. */
  accent: StepAccent
  layout: StepLayout
  /** Optional call-to-action. */
  ctaLabel?: string
  ctaHref?: string
  /** Optional zaps reward stamped when the member completes the slide (Phase B). */
  zaps?: number
  /** Optional activation milestone this slide stands in for, used ONLY by the reserved
   *  Next Steps walkthrough (ONBOARDING_WALKTHROUGH_SLUG): tagging a slide with a criterion
   *  lets the operator author that funnel step's copy/order while the done-detection stays
   *  in code. Ignored on every other walkthrough. */
  criterion?: OnboardingStepKey
}

/** A full walkthrough row. */
export interface Walkthrough {
  id: string
  slug: string
  name: string
  description: string | null
  trigger: WalkthroughTrigger
  audience: string | null
  active: boolean
  cadence: WalkthroughCadence
  priority: number
  startsAt: string | null
  endsAt: string | null
  steps: WalkthroughStep[]
  updatedAt: string | null
  updatedBy: string | null
  createdAt: string | null
}

// ── Friendly labels (shared by the list chips + the editor dropdowns) ────────────

export const TRIGGER_LABELS: Record<WalkthroughTrigger, string> = {
  manual: 'Manual',
  new_member: 'New member',
  role_host: 'Becomes a Host',
  role_guide: 'Becomes a Guide',
  role_mentor: 'Becomes a Mentor',
  circle_lead: 'Becomes a Circle leader',
  season: 'Season launch',
  project: 'Project',
}

/** The list's "when it fires" chip copy — a full plain-English sentence. */
export const TRIGGER_CHIP: Record<WalkthroughTrigger, string> = {
  manual: 'Launched by hand',
  new_member: 'When someone joins',
  role_host: 'When someone becomes a Host',
  role_guide: 'When someone becomes a Guide',
  role_mentor: 'When someone becomes a Mentor',
  circle_lead: 'When someone leads a circle',
  season: 'When a season launches',
  project: 'When a project launches',
}

export const CADENCE_LABELS: Record<WalkthroughCadence, string> = {
  once: 'Show once',
  per_session: 'Once per session',
  daily: 'Once a day',
  until_done: 'Until they finish it',
}

export const LAYOUT_LABELS: Record<StepLayout, string> = {
  centered: 'Centered',
  'media-top': 'Media-top',
  split: 'Split',
}

/** Accent token key → the Tailwind/token class roots the preview composes. The editor
 *  swatch uses `bg`/`text`; the slide preview uses these to stay token-only. */
export const ACCENT_TOKENS: Record<StepAccent, { label: string; swatch: string }> = {
  primary: { label: 'Primary', swatch: 'bg-primary' },
  signal: { label: 'Signal', swatch: 'bg-signal' },
  broadcast: { label: 'Broadcast', swatch: 'bg-broadcast' },
  success: { label: 'Success', swatch: 'bg-success' },
  warning: { label: 'Warning', swatch: 'bg-warning' },
  'rank-gold': { label: 'Gold', swatch: 'bg-[var(--rank-gold)]' },
  'rank-jade': { label: 'Jade', swatch: 'bg-[var(--rank-jade)]' },
  'rank-teal': { label: 'Teal', swatch: 'bg-[var(--rank-teal)]' },
  'rank-indigo': { label: 'Indigo', swatch: 'bg-[var(--rank-indigo)]' },
  'rank-plum': { label: 'Plum', swatch: 'bg-[var(--rank-plum)]' },
  'rank-rose': { label: 'Rose', swatch: 'bg-[var(--rank-rose)]' },
}

export const TRIGGERS = Object.keys(TRIGGER_LABELS) as WalkthroughTrigger[]

/** Triggers whose runtime qualifier is NOT wired yet. `project` has no project entity on
 *  this model (see lib/walkthroughs/runtime.ts `triggerQualifies` + ADR-243), so a
 *  walkthrough set to it would silently never show. This set is load-bearing, not dormant:
 *  it derives AVAILABLE_TRIGGERS, which the editor dropdown and the save-action gate both
 *  read to keep `project` out of an operator's choices. The trigger stays in the union and
 *  labels so any legacy row still renders its chip; it is just never offered as a choice.
 *  Lighting it up later is a one-line change: wire its qualifier in `triggerQualifies`,
 *  then drop it from here (a real "project" entity has to exist first, per ADR-243). */
export const UNWIRED_TRIGGERS = new Set<WalkthroughTrigger>(['project'])

/** The triggers an operator can author against today: every wired trigger. Both the
 *  editor dropdown and the save action gate on this so no one can ship a dead trigger. */
export const AVAILABLE_TRIGGERS = TRIGGERS.filter((t) => !UNWIRED_TRIGGERS.has(t))

export const CADENCES = Object.keys(CADENCE_LABELS) as WalkthroughCadence[]
export const LAYOUTS = Object.keys(LAYOUT_LABELS) as StepLayout[]
export const ACCENTS = Object.keys(ACCENT_TOKENS) as StepAccent[]

export const VALID_TRIGGERS = new Set<string>(TRIGGERS)
export const VALID_CADENCES = new Set<string>(CADENCES)
export const VALID_LAYOUTS = new Set<string>(LAYOUTS)
export const VALID_ACCENTS = new Set<string>(ACCENTS)
export const VALID_CRITERIA = new Set<string>(ONBOARDING_CRITERIA)

// ── Factories ────────────────────────────────────────────────────────────────────

export function rid(): string {
  // Stable-enough client id for a slide / draft (crypto where available).
  try {
    return crypto.randomUUID()
  } catch {
    return `s_${Math.random().toString(36).slice(2, 10)}`
  }
}

/** A fresh, empty slide. */
export function blankStep(partial: Partial<WalkthroughStep> = {}): WalkthroughStep {
  return {
    id: rid(),
    title: '',
    body: '',
    accent: 'primary',
    layout: 'centered',
    ...partial,
  }
}

/** A fresh, unsaved walkthrough draft (for the "New walkthrough" flow + the absent-table
 *  fallback in the editor). Not persisted until the first save. */
export function blankWalkthrough(partial: Partial<Walkthrough> = {}): Walkthrough {
  return {
    id: rid(),
    slug: '',
    name: '',
    description: null,
    trigger: 'manual',
    audience: null,
    active: false,
    cadence: 'once',
    priority: 0,
    startsAt: null,
    endsAt: null,
    steps: [blankStep({ title: 'Welcome' })],
    updatedAt: null,
    updatedBy: null,
    createdAt: null,
    ...partial,
  }
}
