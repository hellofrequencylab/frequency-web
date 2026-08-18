// ── `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// The slide editor imported the model from here and shipped the service-role client to the
// browser with it. The directive makes that a BUILD FAILURE that names the importer.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

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

// The model lives in ./walkthroughs-core (dependency-free) so the slide editor can read it
// without dragging this module's admin client into the browser (LIVE-037). Re-exported here so
// every existing server caller is unchanged.
export type {
  WalkthroughTrigger, WalkthroughCadence, StepLayout, StepAccent, WalkthroughStep, Walkthrough,
} from './walkthroughs-core'
export {
  TRIGGER_LABELS, TRIGGER_CHIP, CADENCE_LABELS, LAYOUT_LABELS, ACCENT_TOKENS,
  TRIGGERS, UNWIRED_TRIGGERS, AVAILABLE_TRIGGERS, CADENCES, LAYOUTS, ACCENTS,
  blankStep, blankWalkthrough,
} from './walkthroughs-core'
import type {
  WalkthroughStep, Walkthrough, WalkthroughTrigger, WalkthroughCadence, StepLayout, StepAccent,
} from './walkthroughs-core'
import { rid, VALID_CRITERIA, VALID_TRIGGERS, VALID_CADENCES, VALID_LAYOUTS, VALID_ACCENTS } from './walkthroughs-core'
import type { OnboardingStepKey } from '@/lib/onboarding/steps'

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
