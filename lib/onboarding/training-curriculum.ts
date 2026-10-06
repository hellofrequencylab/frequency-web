// Role-advancement training curriculum (ADR-224, build §7.3–7.5). The PURE,
// dependency-free spine of role-advancement training: the per-tier curriculum
// registry, the promotion→curriculum selector, and the helper that derives a
// curriculum from `role`-tagged help articles. No Supabase / Next imports, so it
// runs under Node's TS type-stripping and is fully unit-tested. The DB layer
// (training.ts) and the authoring surface both build on this.
//
// One curriculum per COMMUNITY-TRUST rung gained (member < crew < host < guide <
// mentor). A promotion teaches the functions the new rung just unlocked, as a
// curated path through the help center. Registry-defined today; the authoring
// surface (7.5) reads this registry, and `role`-tagged help articles feed it.

import type { CommunityRole } from '@/lib/core/roles'
import { slugify } from '@/lib/utils'

export interface TrainingStep {
  /** Stable id a trainee's per-step completion is stored against (training_paths.completed_steps).
   *  Survives a relabel or reorder, so editing the curriculum never loses anyone's progress. */
  id: string
  label: string
  href: string
}

export interface TrainingDef {
  role: CommunityRole
  title: string
  blurb: string
  steps: TrainingStep[]
  /** Gems paid once on completion (online training → gems, ADR-139). */
  reward: number
}

// The COMMUNITY-TRUST rungs that carry an advancement curriculum, in ascending
// order. 'member' is the entry rung (its induction is the activation funnel, not a
// training Journey), and 'crew' is the first earned step. The staff rungs
// ('admin'/'janitor') are a separate axis (ADR-208) and carry no community
// curriculum. Keep this in step with ROLE_HIERARCHY.
export const TRAINING_TIERS: readonly CommunityRole[] = ['crew', 'host', 'guide', 'mentor'] as const

// The curriculum registry. Behavior-preserving for the two tiers that shipped with
// §7.2 (crew, host); 7.3–7.5 add the guide and mentor rungs so every promotion up
// the ladder has a path. Steps point at help articles — the same content the
// `role` front-matter tag associates (see helpCurriculumSteps below).
export const TRAINING: Partial<Record<CommunityRole, TrainingDef>> = {
  crew: {
    role: 'crew',
    title: 'Welcome to Crew',
    blurb: 'You’re in. Here’s how to get the most out of the community: find your circles and start a practice.',
    steps: [
      { id: 'join-a-circle', label: 'Join a local circle', href: '/help/getting-started/join-a-circle' },
      { id: 'practices', label: 'Adopt a practice', href: '/help/getting-started/practices' },
      { id: 'your-journey', label: 'Follow a Journey', href: '/help/the-quest/your-journey' },
      { id: 'zaps-and-gems', label: 'Earn Zaps and Gems', href: '/help/the-quest/zaps-and-gems' },
    ],
    reward: 15,
  },
  host: {
    role: 'host',
    title: 'Host Training',
    blurb: 'You can host now. This walks you through running a circle and the admin tools that just became yours.',
    steps: [
      { id: 'events', label: 'Run events', href: '/help/groups/events' },
      { id: 'channels', label: 'Use channels', href: '/help/groups/channels' },
      { id: 'dispatches', label: 'Send a Dispatch', href: '/help/sharing/dispatches' },
      { id: 'hubs', label: 'Hubs & scope', href: '/help/groups/hubs' },
    ],
    reward: 25,
  },
  guide: {
    role: 'guide',
    title: 'Guide Training',
    blurb: 'You guide a Hub now, a family of Circles. This covers stewarding hosts, shaping the hub, and the wider tools that just became yours.',
    steps: [
      { id: 'hubs', label: 'Steward a hub', href: '/help/groups/hubs' },
      { id: 'events', label: 'Support your hosts', href: '/help/groups/events' },
      { id: 'channels', label: 'Curate channels across circles', href: '/help/groups/channels' },
      { id: 'dispatches', label: 'Dispatch to the Hub', href: '/help/sharing/dispatches' },
    ],
    reward: 40,
  },
  mentor: {
    role: 'mentor',
    title: 'Mentor Training',
    blurb: 'You mentor a Nexus now, a region of Hubs. This is the widest stewardship: growing guides, holding the standard, and the regional tools that just became yours.',
    steps: [
      { id: 'hubs', label: 'Hold a nexus', href: '/help/groups/hubs' },
      { id: 'events', label: 'Grow and back your guides', href: '/help/groups/events' },
      { id: 'dispatches', label: 'Set the regional rhythm', href: '/help/sharing/dispatches' },
      { id: 'reporting', label: 'Keep the standard', href: '/help/safety/reporting' },
    ],
    reward: 60,
  },
}

/**
 * Which advancement curriculum a member should be assigned when promoted INTO
 * `role`. Returns the curriculum for that rung, or null when the rung carries no
 * curriculum (e.g. 'member', or the staff rungs). Pure selector — the single
 * source for "which Journey for which promotion".
 */
export function curriculumForPromotion(role: CommunityRole): TrainingDef | null {
  return TRAINING[role] ?? null
}

/** Does a promotion into `role` assign a training Journey? */
export function hasCurriculum(role: CommunityRole): boolean {
  return curriculumForPromotion(role) !== null
}

// ── Help-tag-driven curriculum ────────────────────────────────────────────────
//
// A help article can carry a `role` front-matter tag (lib/help/content.ts). Those
// tagged articles ARE the curriculum source: tag the host articles `role: host`
// and they become the host path's steps. This lets curriculum authoring happen in
// the help content (where the words already live) rather than duplicating links in
// a registry. The registry above stays as the curated default + ordering/reward;
// helpCurriculumSteps derives steps from tags when you'd rather drive it that way.

/** Minimal shape we need from a help article — keeps this module free of the help
 *  loader's fs dependency so it stays pure + unit-testable. */
export interface RoleTaggedArticle {
  category: string
  slug: string
  title: string
  order: number
  role?: string
  status?: string
}

export function helpHref(category: string, slug: string): string {
  return `/help/${category}/${slug}`
}

/**
 * Build curriculum steps from the help articles tagged for `role`. Published
 * articles only, sorted by the article `order` then title for a stable path. Pure:
 * the caller supplies the articles (from the help loader). Untagged articles are
 * never included, so this is behavior-preserving for the existing help center.
 */
export function helpCurriculumSteps(
  articles: readonly RoleTaggedArticle[],
  role: CommunityRole,
): TrainingStep[] {
  return articles
    .filter((a) => a.role === role && (a.status ?? 'published') === 'published')
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((a) => ({ id: `${a.category}-${a.slug}`, label: a.title, href: helpHref(a.category, a.slug) }))
}

/**
 * The authoring/preview view of a tier: the registry curriculum for the rung,
 * plus the help articles currently `role`-tagged for it (the editable source). The
 * authoring surface renders this; `taggedSteps` shows what a tag-driven curriculum
 * WOULD produce, so an author can see registry vs. tags side by side.
 */
interface TierCurriculumView {
  role: CommunityRole
  def: TrainingDef | null
  taggedSteps: TrainingStep[]
}

export function tierCurriculumViews(
  articles: readonly RoleTaggedArticle[],
  defs: Partial<Record<CommunityRole, TrainingDef>> = TRAINING,
): TierCurriculumView[] {
  return TRAINING_TIERS.map((role) => ({
    role,
    def: defs[role] ?? null,
    taggedSteps: helpCurriculumSteps(articles, role),
  }))
}

// ── In-place edits (LIVE-690) ─────────────────────────────────────────────────
//
// An operator edits a tier's title, blurb and steps from /admin/content/training. The edit is
// stored as JSON in platform_settings (curriculum-store.ts) and laid OVER the registry above:
// the registry stays the code default and the reward stays in code, so an edit can reword and
// reorder a path but never change what it pays. No stored edit means the registry, unchanged.

export const CURRICULUM_LIMITS = { title: 80, blurb: 300, label: 80, href: 200, minSteps: 1, maxSteps: 12 } as const

/** What an operator may change on one tier. */
export interface CurriculumEdit {
  title: string
  blurb: string
  steps: TrainingStep[]
}

export type CurriculumOverrides = Partial<Record<CommunityRole, CurriculumEdit>>

const STEP_ID = /^[a-z0-9][a-z0-9-]{0,47}$/

/** A step id from a label, for a step an operator just added. PURE. */
export function stepIdFrom(label: string, taken: ReadonlySet<string>): string {
  const base = slugify(label).slice(0, 40) || 'step'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** An internal link only: a site path, never another origin or a protocol-relative URL. PURE. */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !/[\s\\]/.test(href) && href.length <= CURRICULUM_LIMITS.href
}

/**
 * Validate and tidy one tier's edit. Returns the clean edit, or an error a person can act on.
 * Keeps a valid incoming step id (so progress survives a relabel or reorder) and mints one for a
 * new step. PURE.
 */
export function normalizeCurriculumEdit(input: unknown): { ok: true; edit: CurriculumEdit } | { ok: false; error: string } {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const title = String(o.title ?? '').trim()
  const blurb = String(o.blurb ?? '').trim()
  if (!title) return { ok: false, error: 'Give the path a title.' }
  if (title.length > CURRICULUM_LIMITS.title) return { ok: false, error: `Keep the title under ${CURRICULUM_LIMITS.title} characters.` }
  if (blurb.length > CURRICULUM_LIMITS.blurb) return { ok: false, error: `Keep the intro under ${CURRICULUM_LIMITS.blurb} characters.` }
  const rawSteps = Array.isArray(o.steps) ? o.steps : []
  if (rawSteps.length < CURRICULUM_LIMITS.minSteps) return { ok: false, error: 'A path needs at least one step.' }
  if (rawSteps.length > CURRICULUM_LIMITS.maxSteps) return { ok: false, error: `A path holds at most ${CURRICULUM_LIMITS.maxSteps} steps.` }

  const taken = new Set<string>()
  const steps: TrainingStep[] = []
  for (const [i, raw] of rawSteps.entries()) {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const label = String(s.label ?? '').trim()
    const href = String(s.href ?? '').trim()
    if (!label) return { ok: false, error: `Step ${i + 1} needs a label.` }
    if (label.length > CURRICULUM_LIMITS.label) return { ok: false, error: `Step ${i + 1}: keep the label under ${CURRICULUM_LIMITS.label} characters.` }
    if (!isInternalHref(href)) return { ok: false, error: `Step ${i + 1}: the link must be a page on this site, starting with /.` }
    const wanted = String(s.id ?? '').trim()
    const id = STEP_ID.test(wanted) && !taken.has(wanted) ? wanted : stepIdFrom(label, taken)
    taken.add(id)
    steps.push({ id, label, href })
  }
  return { ok: true, edit: { title, blurb, steps } }
}

/** Parse the stored overrides JSON, dropping anything that no longer validates. PURE, never throws. */
export function parseCurriculumOverrides(raw: string | null | undefined): CurriculumOverrides {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const out: CurriculumOverrides = {}
  for (const role of TRAINING_TIERS) {
    const v = (parsed as Record<string, unknown>)[role]
    if (v === undefined) continue
    const r = normalizeCurriculumEdit(v)
    if (r.ok) out[role] = r.edit
  }
  return out
}

/** The registry with the operator's edits laid over it; the reward always comes from code. PURE. */
export function applyCurriculumOverrides(
  base: Partial<Record<CommunityRole, TrainingDef>>,
  overrides: CurriculumOverrides,
): Partial<Record<CommunityRole, TrainingDef>> {
  const out: Partial<Record<CommunityRole, TrainingDef>> = { ...base }
  for (const role of TRAINING_TIERS) {
    const def = base[role]
    const edit = overrides[role]
    if (def && edit) out[role] = { ...def, title: edit.title, blurb: edit.blurb, steps: edit.steps }
  }
  return out
}

/** The step ids a trainee has done, kept to steps still on the path. PURE. */
export function doneStepIds(steps: readonly TrainingStep[], completed: readonly string[] | null | undefined): string[] {
  const done = new Set(completed ?? [])
  return steps.filter((s) => done.has(s.id)).map((s) => s.id)
}
