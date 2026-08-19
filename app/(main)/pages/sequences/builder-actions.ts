'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import {
  saveFunnelOverride,
  getFunnelOverride,
  deleteFunnelVersion,
  setFunnelPublishStatus,
  duplicateFunnel,
  listFunnelVersions,
  type FunnelOverride,
  type FunnelPublishStatus,
} from '@/lib/funnels/overrides'
import { listCodeFunnels, templateSeed, DEFAULT_FUNNEL } from '@/lib/funnels/definitions'

// Funnel lifecycle actions (ADR-162 → splash-editor refactor → ADR-1090). Janitor-
// gated, like the rest of the /pages surface. Saves a Funnel's copy override (every
// voiced beat + title), creates brand-new Funnels, duplicates, publishes, and deletes
// them. Editing happens in the shared copy editor at /pages/sequences/<slug>/edit.

// Static siblings of /join/<slug> (ADR-1090): a Funnel slug equal to one of these
// would be shadowed by the induction's own routes, so the builder refuses them.
const RESERVED_JOIN_SEGMENTS = ['complete', 'preview']

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

/** A slug guaranteed not to collide with a code Funnel, the reserved default, a static
 *  /join sibling route, OR an existing DB Funnel. Reads the live list so a duplicate/new
 *  Funnel can never overwrite another via the slug primary key. */
async function uniqueSlug(base: string): Promise<string> {
  const seed = slugify(base) || 'funnel'
  const taken = new Set<string>([
    ...listCodeFunnels().map((s) => s.slug),
    DEFAULT_FUNNEL,
    ...RESERVED_JOIN_SEGMENTS,
    ...(await listFunnelVersions()).map((v) => v.slug),
  ])
  let slug = seed
  let i = 2
  while (taken.has(slug)) slug = `${seed}-${i++}`
  return slug
}

export async function saveFunnelVersion(slug: string, override: FunnelOverride): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  // The copy editor edits content, not lifecycle — merge over the funnel's current
  // override so a save never silently publishes a draft (or unpublishes a live funnel)
  // and never drops fields the editor doesn't touch (splash, marketing tag).
  const current = await getFunnelOverride(slug)
  const merged: FunnelOverride = {
    ...current,
    ...override,
    status: override.status ?? current?.status,
  }
  await saveFunnelOverride(slug, merged, me?.id ?? null)
  revalidatePath('/join')
  revalidatePath('/pages/sequences')
  revalidatePath(`/pages/sequences/${slug}/edit`)
  return { ok: true }
}

/** Change a custom funnel's PERMALINK (its slug — the `?seq=` value + the /edit path). The slug is the
 *  primary key of the override row, so a rename is: write the row under the new slug, drop the old. The
 *  marketing tag on the row is KEPT as-is so members already tagged by this funnel stay consistent.
 *  Rejects a collision / a reserved-or-code slug. NOTE: existing links to the OLD ?seq= slug stop
 *  resolving (they fall back to the default flow) — the caller warns the operator before renaming. */
export async function renameFunnelSlug(
  oldSlug: string,
  desiredSlug: string,
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  if (!(await getJanitor())) return { ok: false, error: 'Not allowed.' }
  // The default flow + code Funnels own fixed slugs and cannot be renamed here.
  if (oldSlug === DEFAULT_FUNNEL || listCodeFunnels().some((s) => s.slug === oldSlug)) {
    return { ok: false, error: 'This funnel’s permalink is fixed and cannot be changed.' }
  }
  const next = slugify(desiredSlug)
  if (!next) return { ok: false, error: 'Enter a permalink using letters, numbers, and dashes.' }
  if (next === oldSlug) return { ok: true, slug: oldSlug }
  const taken = new Set<string>([
    ...listCodeFunnels().map((s) => s.slug),
    DEFAULT_FUNNEL,
    ...RESERVED_JOIN_SEGMENTS,
    ...(await listFunnelVersions()).map((v) => v.slug),
  ])
  if (taken.has(next)) return { ok: false, error: 'That permalink is already in use. Pick another.' }
  const current = await getFunnelOverride(oldSlug)
  if (!current) return { ok: false, error: 'This funnel could not be found.' }
  const me = await getCallerProfile()
  // Re-key the row: save under the new slug (keeping status + tag + all copy), then delete the old.
  await saveFunnelOverride(next, current, me?.id ?? null)
  await deleteFunnelVersion(oldSlug)
  revalidatePath('/pages/sequences')
  revalidatePath('/join')
  revalidatePath(`/pages/sequences/${oldSlug}/edit`)
  revalidatePath(`/pages/sequences/${next}/edit`)
  return { ok: true, slug: next }
}

export async function createFunnelAction(formData: FormData): Promise<void> {
  if (!(await getJanitor())) return
  const audience = String(formData.get('audience') ?? '').trim() || 'New funnel'
  const slug = await uniqueSlug(audience)
  const me = await getCallerProfile()
  // New funnels start from the PROMPTS TEMPLATE (structure of the live flow, fill-in copy)
  // as a DRAFT: nothing goes live until an operator publishes it. Seeded from `templateSeed()`,
  // never from the live `beta-default` override, so creating a funnel can't touch funnel #1.
  await saveFunnelOverride(
    slug,
    { ...templateSeed(), audience, marketingTag: `beta_${slug.replace(/-/g, '_')}`, status: 'draft' },
    me?.id ?? null,
  )
  redirect(`/pages/sequences/${slug}/edit`)
}

/** Create a brand-new draft funnel from the prompts TEMPLATE (the live flow's structure with
 *  fill-in prompts for every field), then open it in the copy editor. Powers the "Create from
 *  template" button. Seeds from `templateSeed()` — NOT a clone of the current live default —
 *  so a new funnel never inherits (or risks disturbing) funnel #1's real copy. */
export async function createFromTemplateAction(): Promise<void> {
  if (!(await getJanitor())) return
  const slug = await uniqueSlug('funnel')
  const me = await getCallerProfile()
  await saveFunnelOverride(
    slug,
    { ...templateSeed(), audience: 'New funnel', marketingTag: `beta_${slug.replace(/-/g, '_')}`, status: 'draft' },
    me?.id ?? null,
  )
  redirect(`/pages/sequences/${slug}/edit`)
}

/** Duplicate an existing custom funnel into a new draft, then open it in the copy editor. */
export async function duplicateSequenceAction(slug: string): Promise<void> {
  if (!(await getJanitor())) return
  if (slug === DEFAULT_FUNNEL || listCodeFunnels().some((s) => s.slug === slug)) return
  const existing = (await listFunnelVersions()).find((v) => v.slug === slug)
  if (!existing) return
  const label = `${existing.audience ?? slug} copy`
  const newSlug = await uniqueSlug(label)
  const me = await getCallerProfile()
  await duplicateFunnel(slug, newSlug, label, me?.id ?? null)
  redirect(`/pages/sequences/${newSlug}/edit`)
}

/** Publish or unpublish a custom funnel. A draft falls back to the default flow for
 *  visitors (see resolveFunnel); publishing makes its own ?seq link go live. */
export async function setSequenceStatusAction(slug: string, status: FunnelPublishStatus): Promise<void> {
  if (!(await getJanitor())) return
  // The default flow + code sequences are always live and aren't toggled here.
  if (slug === DEFAULT_FUNNEL || listCodeFunnels().some((s) => s.slug === slug)) return
  const me = await getCallerProfile()
  await setFunnelPublishStatus(slug, status, me?.id ?? null)
  revalidatePath('/pages/sequences')
  revalidatePath('/join')
}

export async function deleteSequenceVersionAction(slug: string): Promise<void> {
  if (!(await getJanitor())) return
  // Only DB-created versions are deletable; code sequences are immutable here, and
  // the default flow's override is reset from /pages/splash, not deleted here.
  if (slug === DEFAULT_FUNNEL || listCodeFunnels().some((s) => s.slug === slug)) return
  await deleteFunnelVersion(slug)
  revalidatePath('/pages/sequences')
  redirect('/pages/sequences')
}
