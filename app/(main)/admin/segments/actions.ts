'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import {
  validateSegmentDefinition,
  previewSegmentCount,
  createSegment as createSegmentRow,
  updateSegment as updateSegmentRow,
  deleteSegment as deleteSegmentRow,
  getSegment,
  type SegmentDefinition,
} from '@/lib/traits/segments'

// Segment Builder mutations (ADR-069 Phase 3 → P5). AUTHZ IS ENFORCED HERE: the admin
// client bypasses RLS (docs/ARCHITECTURE.md), so every action re-runs the same gate the
// segments index uses — the staff axis (janitor) OR the `insights` staff domain — but at
// WRITE level, since creating/editing/deleting an audience is a write (the index only
// needs read). Definitions are validated against the trait registry before any write, and
// system segments are refused. Same domain as the read page; never a weaker gate.

export interface SegmentActionResult {
  ok: boolean
  id?: string
  error?: string
}

// The mutation gate: janitor on the staff axis OR the `insights` staff domain at WRITE
// level — the same axis the index page reads, raised to write for a mutation. Returns the
// caller context (so create can stamp created_by without a second lookup). On denial
// requireAdmin redirects, which surfaces as a thrown error inside an action.
function gate() {
  return requireAdmin('janitor', { staff: 'insights', staffLevel: 'write' })
}

/** Validate + (optionally) re-shape the inputs shared by create + update. */
function clean(input: { name: string; description?: string | null; definition: SegmentDefinition }): {
  name: string
  description: string | null
  definition: SegmentDefinition
  error?: string
} {
  const name = input.name.trim()
  const description = input.description?.trim() || null
  if (!name) return { name, description, definition: input.definition, error: 'A segment needs a name.' }
  const problems = validateSegmentDefinition(input.definition)
  if (problems.length) {
    return { name, description, definition: input.definition, error: problems[0] }
  }
  return { name, description, definition: input.definition }
}

export async function createSegment(input: {
  name: string
  description?: string | null
  definition: SegmentDefinition
}): Promise<SegmentActionResult> {
  const { profileId } = await gate()
  const { name, description, definition, error } = clean(input)
  if (error) return { ok: false, error }
  try {
    const id = await createSegmentRow({ name, description, definition }, profileId)
    revalidatePath('/admin/segments')
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the segment.' }
  }
}

export async function updateSegment(input: {
  id: string
  name: string
  description?: string | null
  definition: SegmentDefinition
}): Promise<SegmentActionResult> {
  await gate()
  const existing = await getSegment(input.id)
  if (!existing) return { ok: false, error: 'That segment no longer exists.' }
  if (existing.is_system) return { ok: false, error: 'Built-in segments can’t be edited.' }
  const { name, description, definition, error } = clean(input)
  if (error) return { ok: false, error }
  try {
    await updateSegmentRow(input.id, existing, { name, description, definition })
    revalidatePath('/admin/segments')
    return { ok: true, id: input.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the segment.' }
  }
}

export async function deleteSegment(id: string): Promise<SegmentActionResult> {
  await gate()
  const existing = await getSegment(id)
  if (!existing) return { ok: false, error: 'That segment no longer exists.' }
  if (existing.is_system) return { ok: false, error: 'Built-in segments can’t be deleted.' }
  try {
    await deleteSegmentRow(id)
    revalidatePath('/admin/segments')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not delete the segment.' }
  }
}

/** Live preview: how many members match a (possibly in-progress) definition. Invalid /
 *  empty definitions report 0 rather than throwing, so the composer can debounce-call it
 *  freely while the operator is still building predicates. */
export async function previewSegment(definition: SegmentDefinition): Promise<{ count: number; valid: boolean }> {
  await gate()
  const valid = validateSegmentDefinition(definition).length === 0
  if (!valid) return { count: 0, valid: false }
  return { count: await previewSegmentCount(definition), valid: true }
}
