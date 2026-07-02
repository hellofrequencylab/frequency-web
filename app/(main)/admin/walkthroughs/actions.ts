'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  AVAILABLE_TRIGGERS,
  CADENCES,
  type Walkthrough,
  type WalkthroughStep,
  type WalkthroughTrigger,
  type WalkthroughCadence,
} from '@/lib/walkthroughs'
import {
  DEFAULT_ONBOARDING_ORDER,
  DEFAULT_ONBOARDING_STEPS,
  ONBOARDING_WALKTHROUGH_SLUG,
} from '@/lib/onboarding/steps'

// Server actions for the Walkthroughs suite (Phase A). Acquisition-gated — marketing
// staff (or janitor) only, mirroring the rest of the Onboarding surface. Writes go
// through the untyped admin client (the `walkthrough` table predates the generated
// types). Fail-closed: the gate throws on denial, and every action revalidates the
// admin list so the suite reflects the change immediately. Triggering + rendering are
// Phase B — these actions only author the model.

const LIST_PATH = '/admin/walkthroughs'

async function gate(): Promise<string> {
  // requireAdmin redirects an unauthorized viewer; we still capture the id for updated_by.
  const { profileId } = await requireAdmin('host', { staff: 'marketing' })
  return profileId
}

function db(): SupabaseClient {
  return createAdminClient()
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

/** Build a slug that doesn't collide with an existing walkthrough. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'walkthrough'
  const { data } = await db().from('walkthrough').select('slug')
  const taken = new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug))
  if (!taken.has(root)) return root
  let i = 2
  while (taken.has(`${root}-${i}`)) i++
  return `${root}-${i}`
}

// Gate saves on wired triggers only — an unwired trigger (e.g. `project`) is dropped from
// the patch rather than persisted, so the editor can't ship a walkthrough that never fires.
const TRIGGER_SET = new Set<string>(AVAILABLE_TRIGGERS)
const CADENCE_SET = new Set<string>(CADENCES)

/** Coerce + sanitize an editor patch into the DB column shape (drops unknown keys,
 *  clamps the enums, never trusts client text blindly). */
type WalkthroughPatch = Partial<
  Pick<Walkthrough, 'name' | 'description' | 'trigger' | 'audience' | 'cadence' | 'priority' | 'startsAt' | 'endsAt' | 'steps'>
>

function toColumns(patch: WalkthroughPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.name !== undefined) out.name = String(patch.name).slice(0, 200)
  if (patch.description !== undefined) out.description = patch.description ? String(patch.description).slice(0, 2000) : null
  if (patch.trigger !== undefined && TRIGGER_SET.has(patch.trigger)) out.trigger = patch.trigger as WalkthroughTrigger
  if (patch.audience !== undefined) out.audience = patch.audience ? String(patch.audience).slice(0, 200) : null
  if (patch.cadence !== undefined && CADENCE_SET.has(patch.cadence)) out.cadence = patch.cadence as WalkthroughCadence
  if (patch.priority !== undefined) out.priority = Math.trunc(Number(patch.priority)) || 0
  if (patch.startsAt !== undefined) out.starts_at = patch.startsAt || null
  if (patch.endsAt !== undefined) out.ends_at = patch.endsAt || null
  if (patch.steps !== undefined) out.steps = (patch.steps as WalkthroughStep[]).map((s) => ({ ...s }))
  return out
}

/** Create a fresh draft walkthrough and jump into its editor. Redirects on success
 *  (returns nothing); returns a failure the caller can render when the insert doesn't land. */
export async function createWalkthrough(input?: { name?: string }): Promise<ActionResult | void> {
  const me = await gate()
  const name = (input?.name ?? '').trim() || 'New walkthrough'
  const slug = await uniqueSlug(name)
  const { data, error } = await db()
    .from('walkthrough')
    .insert({ slug, name, updated_by: me, steps: [] })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the walkthrough.')
  revalidatePath(LIST_PATH)
  redirect(`${LIST_PATH}/${(data as { id: string }).id}`)
}

/** Open the reserved Next Steps funnel editor, seeding the row from the default copy if it
 *  doesn't exist yet. Each seeded slide is pre-tagged with its activation criterion so the
 *  funnel's done-detection works immediately; operators then edit the copy/order. The row
 *  ships active (it only ever renders as the persistent feed guide, never a card). */
export async function editOnboardingWalkthrough(): Promise<ActionResult | void> {
  const me = await gate()
  const { data: existing } = await db()
    .from('walkthrough')
    .select('id')
    .eq('slug', ONBOARDING_WALKTHROUGH_SLUG)
    .maybeSingle()

  let id = (existing as { id: string } | null)?.id ?? null
  if (!id) {
    const steps = DEFAULT_ONBOARDING_ORDER.map((key) => {
      const d = DEFAULT_ONBOARDING_STEPS[key]
      return {
        id: `seed_${key}`,
        title: d.label,
        body: d.blurb,
        accent: 'broadcast',
        layout: 'centered',
        ctaLabel: d.cta,
        ctaHref: d.href,
        criterion: key,
      }
    })
    const { data, error } = await db()
      .from('walkthrough')
      .insert({
        slug: ONBOARDING_WALKTHROUGH_SLUG,
        name: 'Next Steps (activation funnel)',
        description: 'The new-member activation funnel shown in the feed. Tag each slide with an activation step; copy and order are yours, the done-detection stays automatic.',
        trigger: 'new_member',
        active: true,
        cadence: 'until_done',
        steps,
        updated_by: me,
      })
      .select('id')
      .single()
    if (error || !data) return fail('Could not open Next Steps. Please try again.')
    id = (data as { id: string }).id
  }
  revalidatePath(LIST_PATH)
  redirect(`${LIST_PATH}/${id}`)
}

/** Patch a walkthrough's meta + slides (the editor's Save). */
export async function updateWalkthrough(id: string, patch: WalkthroughPatch): Promise<ActionResult> {
  const me = await gate()
  const columns = toColumns(patch)
  if (Object.keys(columns).length === 0) return ok()
  const { error } = await db()
    .from('walkthrough')
    .update({ ...columns, updated_by: me })
    .eq('id', id)
  if (error) return fail('Could not save the walkthrough.')
  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${id}`)
  return ok()
}

/** Flip a walkthrough on or off (the list + editor toggle). */
export async function setWalkthroughActive(id: string, active: boolean): Promise<ActionResult> {
  const me = await gate()
  const { error } = await db().from('walkthrough').update({ active, updated_by: me }).eq('id', id)
  if (error) return fail('Could not update the walkthrough.')
  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${id}`)
  return ok()
}

/** Clone a walkthrough (always inactive, "… (copy)"). */
export async function duplicateWalkthrough(id: string): Promise<ActionResult> {
  const me = await gate()
  const { data: src } = await db().from('walkthrough').select('*').eq('id', id).maybeSingle()
  if (!src) return fail('That walkthrough no longer exists.')
  const row = src as Record<string, unknown>
  const slug = await uniqueSlug(`${row.slug as string}-copy`)
  const { error } = await db().from('walkthrough').insert({
    slug,
    name: `${row.name as string} (copy)`,
    description: row.description ?? null,
    trigger: row.trigger ?? 'manual',
    audience: row.audience ?? null,
    active: false,
    cadence: row.cadence ?? 'once',
    priority: row.priority ?? 0,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    steps: row.steps ?? [],
    updated_by: me,
  })
  if (error) return fail('Could not duplicate the walkthrough.')
  revalidatePath(LIST_PATH)
  return ok()
}

/** Delete a walkthrough. */
export async function deleteWalkthrough(id: string): Promise<ActionResult> {
  await gate()
  const { error } = await db().from('walkthrough').delete().eq('id', id)
  if (error) return fail('Could not delete the walkthrough.')
  revalidatePath(LIST_PATH)
  return ok()
}
