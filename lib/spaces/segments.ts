// SAVED AUDIENCE SEGMENTS for Space campaigns (ADR-380). A segment is a saved, named AudienceFilter a
// Space owner can reuse across campaigns. This module is the per-Space analog of lib/spaces/campaigns.ts:
// pure validation/normalization helpers (no Supabase/Next imports, unit-testable), then a thin IO layer
// of untyped admin-client reads/writes over the `space_segments` table (not in the generated DB types
// yet, ADR-246). The action IMPLEMENTATIONS live here as plain async functions; the thin 'use server'
// wrappers the CLIENT calls live in lib/spaces/segments-actions.ts (this module has NO 'use server'
// directive so it can also export the pure helpers + types the surfaces import).
//
// TENANCY + AUTHZ (ADR-246/328/329). A Space A caller never sees or edits Space B's segments: every
// READ filters `space_id = spaceId`, and every single-row read ALSO filters space_id so a cross-space id
// leaks nothing. WRITES are gated on canEditProfile (owner / admin / editor) via getSpaceCapabilities
// and re-validate the segment belongs to the Space before mutating (the update/delete bind both id AND
// space_id). Reads FAIL-SAFE (empty / null); writes FAIL-CLOSED on a permission miss.
//
// The stored `definition` jsonb is an AudienceFilter-shaped object (lib/spaces/audiences.ts). It is
// normalized through definitionToFilter on the way in AND read through it on the way out, so a stored
// definition can never nest another segmentId (a segment never references another segment).

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { definitionToFilter, type AudienceFilter } from '@/lib/spaces/audiences'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One saved segment as the app consumes it (camelCased). `definition` is the normalized
 *  AudienceFilter (tag / consent), never carrying a nested segmentId. */
export interface SpaceSegment {
  id: string
  name: string
  definition: AudienceFilter
  createdAt: string | null
}

const MAX_NAME_LEN = 80

// ── PURE: validation / normalization (no IO, testable) ──────────────────────────────────────────

/** Trim + length-cap a segment name; returns '' if absent / blank (the caller rejects an empty name
 *  on create). Pure. */
export function normalizeSegmentName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_NAME_LEN) : ''
}

/** Normalize a proposed segment definition to a safe AudienceFilter, dropping any nested segmentId
 *  (a segment never references another segment) and keeping only the known facets. Pure (delegates to
 *  the audiences normalizer so the storage shape can never drift from the resolve shape). */
export function normalizeSegmentDefinition(raw: unknown): AudienceFilter {
  return definitionToFilter(raw)
}

/** Validate a create/update payload. Returns the trimmed name + normalized definition, or an error
 *  string if the name is blank. Pure: the single place "what makes a valid segment" is decided, so the
 *  action and the tests agree. */
export function validateSegment(
  name: unknown,
  definition: unknown,
): { name: string; definition: AudienceFilter } | { error: string } {
  const cleanName = normalizeSegmentName(name)
  if (!cleanName) return { error: 'Give your segment a name.' }
  return { name: cleanName, definition: normalizeSegmentDefinition(definition) }
}

// ── IO: the untyped admin-client seam (space_segments not in generated types yet, ADR-246) ──────

type SegmentRow = {
  id: string
  name: string
  definition: unknown
  created_at: string | null
}

type SegmentQuery = {
  select: (cols: string) => SegmentQuery
  eq: (col: string, val: string) => SegmentQuery
  order: (col: string, opts: { ascending: boolean }) => SegmentQuery
  insert: (rows: Record<string, unknown>[]) => SegmentQuery
  update: (patch: Record<string, unknown>) => SegmentQuery
  delete: () => SegmentQuery
  maybeSingle: () => Promise<{ data: SegmentRow | null; error: unknown }>
  then: (resolve: (r: { data: SegmentRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

const SEGMENT_COLS = 'id, name, definition, created_at, space_id'

/** The untyped `space_segments` query builder (table not in the generated types yet). */
function segmentsTable(): SegmentQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => SegmentQuery }
  return db.from('space_segments')
}

/** Map a DB row to a typed SpaceSegment, normalizing the stored definition. */
function mapSegment(r: SegmentRow): SpaceSegment {
  return {
    id: r.id,
    name: r.name,
    definition: definitionToFilter(r.definition),
    createdAt: r.created_at ?? null,
  }
}

/** Read one segment by id, PINNED to a Space (so a cross-space id resolves to null). Service-role;
 *  FAIL-SAFE to null. */
async function readSegment(id: string, spaceId: string): Promise<SegmentRow | null> {
  try {
    const { data, error } = await segmentsTable()
      .select(SEGMENT_COLS)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/**
 * A Space's saved segments, newest first. Filters space_id, so it only ever returns THIS Space's
 * segments. Service-role; the CALLER gates authorization. FAIL-SAFE to [].
 */
export async function listSpaceSegments(spaceId: string): Promise<SpaceSegment[]> {
  if (!spaceId) return []
  try {
    return await new Promise<SpaceSegment[]>((resolve) => {
      segmentsTable()
        .select(SEGMENT_COLS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error || !data) return resolve([])
          resolve(data.map(mapSegment))
        })
    })
  } catch {
    return []
  }
}

// ── Shared authz: resolve the Space + the editor gate in one place ──────────────────────────────

/** Resolve a Space and check the caller may EDIT it (owner / admin / editor). Centralizes the write
 *  gate so every mutation fails closed identically. */
async function requireSpaceEditor(spaceId: string): Promise<{ ok: true } | ActionResult<never>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage your segments.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage segments for this space.')
  return { ok: true }
}

// ── ACTION IMPLEMENTATIONS (gated + validated server-side; wrapped by segments-actions.ts) ──────

/**
 * Save a named segment in a Space. Gated on canEditProfile. Requires a non-empty name; the definition
 * is normalized (a nested segmentId is dropped). Stamps space_id. Returns the new segment id.
 * Fail-closed on permission / validation.
 */
export async function createSpaceSegment(
  spaceId: string,
  name: unknown,
  definition: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const valid = validateSegment(name, definition)
  if ('error' in valid) return fail(valid.error)

  try {
    const { data, error } = await segmentsTable()
      .insert([{ space_id: spaceId, name: valid.name, definition: valid.definition }])
      .select(SEGMENT_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not save the segment. Try again.')
    return ok({ id: data.id })
  } catch {
    return fail('Could not save the segment. Try again.')
  }
}

/**
 * Rename / redefine a segment. Gated on canEditProfile AND the segment belonging to the Space (re-read
 * pinned to space_id; the write binds both id AND space_id). Fail-closed.
 */
export async function updateSpaceSegment(
  spaceId: string,
  id: string,
  name: unknown,
  definition: unknown,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readSegment(id, spaceId)
  if (!existing) return fail('Segment not found.')

  const valid = validateSegment(name, definition)
  if ('error' in valid) return fail(valid.error)

  try {
    const { error } = await segmentsTable()
      .update({ name: valid.name, definition: valid.definition, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not save the segment. Try again.')
  } catch {
    return fail('Could not save the segment. Try again.')
  }
  return ok()
}

/**
 * Delete a segment. Gated on canEditProfile AND the segment belonging to the Space (the write binds
 * both id AND space_id, so a cross-space id is a no-op). Fail-closed.
 */
export async function deleteSpaceSegment(spaceId: string, id: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readSegment(id, spaceId)
  if (!existing) return fail('Segment not found.')

  try {
    const { error } = await segmentsTable()
      .delete()
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not delete the segment. Try again.')
  } catch {
    return fail('Could not delete the segment. Try again.')
  }
  return ok()
}
