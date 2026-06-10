'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import { saveSequenceOverride, deleteSequenceVersion, type SequenceOverride } from '@/lib/onboarding/sequence-overrides'
import { listSequences, DEFAULT_SEQUENCE } from '@/lib/onboarding/beta-sequences'

// The full-induction sequence builder (ADR-162). Janitor-gated, like the rest of the
// sequences surface. Saves the whole sequence override (every voiced beat), creates
// brand-new versions, and deletes custom ones.

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

export async function saveSequenceVersion(slug: string, override: SequenceOverride): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  await saveSequenceOverride(slug, override, me?.id ?? null)
  revalidatePath('/onboarding/beta')
  revalidatePath('/pages/sequences')
  revalidatePath(`/pages/sequences/${slug}/build`)
  return { ok: true }
}

export async function createSequenceVersion(formData: FormData): Promise<void> {
  if (!(await getJanitor())) return
  const audience = String(formData.get('audience') ?? '').trim() || 'New version'
  const base = slugify(audience) || 'version'
  // Reserved: code sequences + the `beta-default` slug (the default flow's override).
  const reserved = new Set([...listSequences().map((s) => s.slug), DEFAULT_SEQUENCE])
  let slug = base
  let i = 2
  while (reserved.has(slug)) slug = `${base}-${i++}`
  const me = await getCallerProfile()
  await saveSequenceOverride(slug, { audience, marketingTag: `beta_${slug.replace(/-/g, '_')}` }, me?.id ?? null)
  redirect(`/pages/sequences/${slug}/build`)
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
