'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import {
  saveSequenceOverride,
  getSequenceOverride,
  deleteSequenceVersion,
  setSequenceStatus,
  duplicateSequence,
  listSequenceVersions,
  type SequenceOverride,
  type SequenceStatus,
} from '@/lib/onboarding/sequence-overrides'
import { listSequences, DEFAULT_SEQUENCE } from '@/lib/onboarding/beta-sequences'

// The full-induction sequence builder (ADR-162). Janitor-gated, like the rest of the
// sequences surface. Saves the whole sequence override (every voiced beat), creates
// brand-new versions, and deletes custom ones.

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

/** A slug guaranteed not to collide with a code sequence, the reserved default, OR an
 *  existing DB funnel. Reads the live version list so a duplicate/new funnel can never
 *  overwrite another via the slug primary key. */
async function uniqueSlug(base: string): Promise<string> {
  const seed = slugify(base) || 'funnel'
  const taken = new Set<string>([
    ...listSequences().map((s) => s.slug),
    DEFAULT_SEQUENCE,
    ...(await listSequenceVersions()).map((v) => v.slug),
  ])
  let slug = seed
  let i = 2
  while (taken.has(slug)) slug = `${seed}-${i++}`
  return slug
}

export async function saveSequenceVersion(slug: string, override: SequenceOverride): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  // The wizard edits content, not publish state — carry the funnel's current status
  // forward so a save never silently publishes a draft (or unpublishes a live funnel).
  const current = await getSequenceOverride(slug)
  const merged: SequenceOverride = { ...override, status: override.status ?? current?.status }
  await saveSequenceOverride(slug, merged, me?.id ?? null)
  revalidatePath('/onboarding/beta')
  revalidatePath('/pages/sequences')
  revalidatePath(`/pages/sequences/${slug}/build`)
  return { ok: true }
}

export async function createSequenceVersion(formData: FormData): Promise<void> {
  if (!(await getJanitor())) return
  const audience = String(formData.get('audience') ?? '').trim() || 'New funnel'
  const slug = await uniqueSlug(audience)
  const me = await getCallerProfile()
  // New funnels start as drafts: nothing goes live until an operator publishes it.
  await saveSequenceOverride(
    slug,
    { audience, marketingTag: `beta_${slug.replace(/-/g, '_')}`, status: 'draft' },
    me?.id ?? null,
  )
  redirect(`/pages/sequences/${slug}/build`)
}

/** Create a brand-new draft funnel cloned from the default "Splash Funnel" template,
 *  then open it in the builder. Powers the "Create from Template" button. */
export async function createFromTemplateAction(): Promise<void> {
  if (!(await getJanitor())) return
  const slug = await uniqueSlug('funnel')
  const me = await getCallerProfile()
  await duplicateSequence(DEFAULT_SEQUENCE, slug, 'New funnel', me?.id ?? null)
  redirect(`/pages/sequences/${slug}/build`)
}

/** Duplicate an existing custom funnel into a new draft, then open it in the builder. */
export async function duplicateSequenceAction(slug: string): Promise<void> {
  if (!(await getJanitor())) return
  if (slug === DEFAULT_SEQUENCE || listSequences().some((s) => s.slug === slug)) return
  const existing = (await listSequenceVersions()).find((v) => v.slug === slug)
  if (!existing) return
  const label = `${existing.audience ?? slug} copy`
  const newSlug = await uniqueSlug(label)
  const me = await getCallerProfile()
  await duplicateSequence(slug, newSlug, label, me?.id ?? null)
  redirect(`/pages/sequences/${newSlug}/build`)
}

/** Publish or unpublish a custom funnel. A draft falls back to the default flow for
 *  visitors (see resolveSequence); publishing makes its own ?seq link go live. */
export async function setSequenceStatusAction(slug: string, status: SequenceStatus): Promise<void> {
  if (!(await getJanitor())) return
  // The default flow + code sequences are always live and aren't toggled here.
  if (slug === DEFAULT_SEQUENCE || listSequences().some((s) => s.slug === slug)) return
  const me = await getCallerProfile()
  await setSequenceStatus(slug, status, me?.id ?? null)
  revalidatePath('/pages/sequences')
  revalidatePath('/onboarding/beta')
}

export async function deleteSequenceVersionAction(slug: string): Promise<void> {
  if (!(await getJanitor())) return
  // Only DB-created versions are deletable; code sequences are immutable here, and
  // the default flow's override is reset from /pages/splash, not deleted here.
  if (slug === DEFAULT_SEQUENCE || listSequences().some((s) => s.slug === slug)) return
  await deleteSequenceVersion(slug)
  revalidatePath('/pages/sequences')
  redirect('/pages/sequences')
}
