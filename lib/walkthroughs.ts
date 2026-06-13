import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ONBOARDING_CRITERIA, type OnboardingStepKey } from '@/lib/onboarding/steps'

// Walkthroughs (Phase A) — the model + best-effort reads for the management suite and
// the slide editor. A walkthrough is an ordered set of instructional slides shown to a
// member at a moment that matters (their first day, the day they become a Host, a
// season/project launch), targeted by `trigger` + `audience` and paced by `cadence`.
//
// The `walkthrough` table predates the generated DB types and may be ABSENT before its
// migration is applied, so every read is best-effort: a loosely-typed admin client
// wrapped in try/catch that returns [] / null rather than throwing. The list then shows
// its empty state and the editor works on an in-memory draft until the first save.
//
// Phase B (NOT built here) owns the in-app triggering + rendering and will migrate the
// hardcoded next-step list in lib/onboarding/status.ts onto this model.

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
 *  walkthrough set to it would silently never show. It stays in the union + labels so any
 *  legacy row still renders its chip — it's just never offered as a choice. Wire the
 *  qualifier, then drop it from here to light it up. */
export const UNWIRED_TRIGGERS = new Set<WalkthroughTrigger>(['project'])

/** The triggers an operator can author against today — every wired trigger. Both the
 *  editor dropdown and the save action gate on this so no one can ship a dead trigger. */
export const AVAILABLE_TRIGGERS = TRIGGERS.filter((t) => !UNWIRED_TRIGGERS.has(t))

export const CADENCES = Object.keys(CADENCE_LABELS) as WalkthroughCadence[]
export const LAYOUTS = Object.keys(LAYOUT_LABELS) as StepLayout[]
export const ACCENTS = Object.keys(ACCENT_TOKENS) as StepAccent[]

const VALID_TRIGGERS = new Set<string>(TRIGGERS)
const VALID_CADENCES = new Set<string>(CADENCES)
const VALID_LAYOUTS = new Set<string>(LAYOUTS)
const VALID_ACCENTS = new Set<string>(ACCENTS)
const VALID_CRITERIA = new Set<string>(ONBOARDING_CRITERIA)

// ── Factories ────────────────────────────────────────────────────────────────────

function rid(): string {
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

// ── Best-effort reads ──────────────────────────────────────────────────────────

// `walkthrough` predates the generated types — loosely-typed admin client.
function db(): SupabaseClient {
  return createAdminClient()
}

interface WalkthroughRow {
  id: string
  slug: string
  name: string
  description: string | null
  trigger: string
  audience: string | null
  active: boolean
  cadence: string
  priority: number
  starts_at: string | null
  ends_at: string | null
  steps: unknown
  updated_at: string | null
  updated_by: string | null
  created_at: string | null
}

function normalizeStep(raw: unknown): WalkthroughStep {
  const s = (raw ?? {}) as Record<string, unknown>
  const accent = typeof s.accent === 'string' && VALID_ACCENTS.has(s.accent) ? (s.accent as StepAccent) : 'primary'
  const layout = typeof s.layout === 'string' && VALID_LAYOUTS.has(s.layout) ? (s.layout as StepLayout) : 'centered'
  return {
    id: typeof s.id === 'string' && s.id ? s.id : rid(),
    title: typeof s.title === 'string' ? s.title : '',
    body: typeof s.body === 'string' ? s.body : '',
    mediaUrl: typeof s.mediaUrl === 'string' ? s.mediaUrl : undefined,
    icon: typeof s.icon === 'string' ? s.icon : undefined,
    accent,
    layout,
    ctaLabel: typeof s.ctaLabel === 'string' ? s.ctaLabel : undefined,
    ctaHref: typeof s.ctaHref === 'string' ? s.ctaHref : undefined,
    zaps: typeof s.zaps === 'number' ? s.zaps : undefined,
    criterion: typeof s.criterion === 'string' && VALID_CRITERIA.has(s.criterion) ? (s.criterion as OnboardingStepKey) : undefined,
  }
}

function fromRow(row: WalkthroughRow): Walkthrough {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    trigger: VALID_TRIGGERS.has(row.trigger) ? (row.trigger as WalkthroughTrigger) : 'manual',
    audience: row.audience,
    active: !!row.active,
    cadence: VALID_CADENCES.has(row.cadence) ? (row.cadence as WalkthroughCadence) : 'once',
    priority: typeof row.priority === 'number' ? row.priority : 0,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    steps: Array.isArray(row.steps) ? row.steps.map(normalizeStep) : [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  }
}

/** Every walkthrough, newest first. Best-effort: [] if the table is absent (pre-migration). */
export async function getWalkthroughs(): Promise<Walkthrough[]> {
  try {
    const { data, error } = await db()
      .from('walkthrough')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return []
    return ((data ?? []) as WalkthroughRow[]).map(fromRow)
  } catch {
    return []
  }
}

/** One walkthrough by slug. Best-effort: null if absent / not found. */
export async function getWalkthrough(slug: string): Promise<Walkthrough | null> {
  try {
    const { data, error } = await db().from('walkthrough').select('*').eq('slug', slug).maybeSingle()
    if (error || !data) return null
    return fromRow(data as WalkthroughRow)
  } catch {
    return null
  }
}

/** One walkthrough by id. Best-effort: null if absent / not found (drives the editor load). */
export async function getWalkthroughById(id: string): Promise<Walkthrough | null> {
  try {
    const { data, error } = await db().from('walkthrough').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return fromRow(data as WalkthroughRow)
  } catch {
    return null
  }
}
