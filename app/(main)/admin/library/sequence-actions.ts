'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/library/store'
import { recordVersion } from '@/lib/library/versions'
import { LIBRARY_STATUSES, type LibraryStatus } from '@/lib/library/types'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { slugify } from '@/lib/utils'
import {
  parseSequenceDef,
  type SequenceDef,
  type SequenceTarget,
} from '@/lib/onboarding/sequence-schema'
import { validateSequenceDef } from '@/lib/onboarding/validate-sequence'
import { DEFAULT_ONBOARDING_SEQUENCE } from '@/lib/onboarding/default-sequence'

// The WRITE layer for managed onboarding flows (Loom kind='sequence'; docs/LOOM-PLATFORM.md §3). The
// READ side (resolve-onboarding-sequence.ts, the runner, the staff preview) was already built and
// dormant; this is the CREATE / EDIT / PUBLISH / VERSION surface that feeds it. Janitor-gated, and the
// publish gate NEVER lets an invalid flow reach `approved`/`final` (the statuses the resolver serves
// live), so nothing here can touch a live member until a future flagged cutover.
//
// library_assets isn't in lib/database.types.ts yet, so we use the repo's standard untyped admin
// handle (see lib/library/store.ts). Service-role only; every action re-checks the janitor gate.

// eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const dbh = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient

/** The rungs of the brand-build ladder that serve a flow LIVE (mirrors resolve-onboarding-sequence). */
const LIVE_STATUSES = new Set<LibraryStatus>(['approved', 'final'])

/** A short, collision-resistant suffix so two flows with the same title never clash on slug. */
function stamp(): string {
  return `${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`
}

/** Build a new flow's seed config: the code default, retitled + optionally targeted. */
function seedConfig(key: string, label: string, target?: SequenceTarget): SequenceDef {
  const seed: SequenceDef = structuredClone(DEFAULT_ONBOARDING_SEQUENCE)
  seed.key = key
  seed.label = label
  if (target && ((target.personas?.length ?? 0) > 0 || (target.regionIds?.length ?? 0) > 0)) {
    seed.target = target
  } else {
    delete seed.target
  }
  return seed
}

/** Read one sequence row's raw config + status (untrusted jsonb), or null if it isn't a sequence. */
async function readSequenceRow(id: string): Promise<{ config: unknown; status: string } | null> {
  const { data } = await dbh()
    .from('library_assets')
    .select('config, status, kind')
    .eq('id', id)
    .maybeSingle()
  const row = data as { config: unknown; status: string; kind: string } | null
  if (!row || row.kind !== 'sequence') return null
  return { config: row.config, status: row.status }
}

/** Create a new draft onboarding flow in the root/shared library, seeded from the code default. */
export async function createSequence(input: {
  title: string
  target?: SequenceTarget
}): Promise<ActionResult<{ id: string }>> {
  await requireAdmin('janitor')

  const title = input.title.trim()
  if (!title) return fail('Give the flow a title.')

  const spaceId = await getRootSpaceId()
  if (!spaceId) return fail('No root space found; cannot scope the flow.')

  const slug = `${slugify(title).slice(0, 120) || 'onboarding-flow'}-${stamp()}`
  const config = seedConfig(slug, title, input.target)

  const { data, error } = await dbh()
    .from('library_assets')
    .insert({
      space_id: spaceId,
      kind: 'sequence',
      title: title.slice(0, 200),
      slug,
      status: 'draft',
      visibility: 'space',
      config,
    })
    .select('id')
    .maybeSingle()
  if (error) return fail(error.message)
  const newId = (data as { id?: unknown } | null)?.id
  if (!newId) return fail('Could not create the flow.')

  revalidatePath('/admin/library?lane=sequence')
  return ok({ id: String(newId) })
}

/** Save an edited flow's config. Parses + validates (rejects an invalid flow), snapshots the prior
 *  state as a version BEFORE writing, then updates `config`. */
export async function updateSequenceConfig(
  id: string,
  def: SequenceDef,
  note = 'Edited flow',
): Promise<ActionResult<void>> {
  const ctx = await requireAdmin('janitor')
  if (!id) return fail('Missing flow id.')

  // Shape gate (untrusted jsonb → SequenceDef) then the semantic gate.
  const parsed = parseSequenceDef(def)
  if (!parsed) return fail('The flow is not structurally valid. Every step needs an id and a type.')
  const check = validateSequenceDef(parsed)
  if (!check.ok) return fail(check.errors.join(' '))

  // Snapshot the pre-edit state first, so every save is reversible from the History section.
  await recordVersion(id, note, ctx.profileId)

  const { error } = await dbh()
    .from('library_assets')
    .update({ config: parsed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'sequence')
  if (error) return fail(error.message)

  revalidatePath('/admin/library?lane=sequence')
  return ok()
}

/** Move a flow along the brand-build ladder. Publishing (approved/final) is BLOCKED unless the stored
 *  config passes validation, so the resolver never serves an invalid flow to a live member. */
export async function setSequenceStatus(id: string, status: string): Promise<ActionResult<void>> {
  await requireAdmin('janitor')
  if (!id) return fail('Missing flow id.')
  if (!(LIBRARY_STATUSES as readonly string[]).includes(status)) {
    return fail('Unknown status.')
  }
  const next = status as LibraryStatus

  // Guard the publish rungs: read the live config and re-validate before it can serve members.
  if (LIVE_STATUSES.has(next)) {
    const row = await readSequenceRow(id)
    if (!row) return fail('Flow not found.')
    const parsed = parseSequenceDef(row.config)
    if (!parsed) return fail('This flow cannot be published: its config is not structurally valid.')
    const check = validateSequenceDef(parsed)
    if (!check.ok) return fail(`This flow cannot be published: ${check.errors.join(' ')}`)
  }

  const { error } = await dbh()
    .from('library_assets')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'sequence')
  if (error) return fail(error.message)

  revalidatePath('/admin/library?lane=sequence')
  return ok()
}

/** Soft-remove a flow: hide it without destroying its config or version history. */
export async function archiveSequence(id: string): Promise<ActionResult<void>> {
  await requireAdmin('janitor')
  if (!id) return fail('Missing flow id.')
  const { error } = await dbh()
    .from('library_assets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'sequence')
  if (error) return fail(error.message)
  revalidatePath('/admin/library?lane=sequence')
  return ok()
}
