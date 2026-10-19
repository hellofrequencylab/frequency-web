'use server'

// The Event and Circle cards' picker actions (EMAIL-025): search a Space, then list THAT Space's upcoming
// events or live circles as send-ready snapshots the block stores. The compile path (lib/email-studio/
// data-blocks.ts) refreshes a stored snapshot at send, so these reads only have to be right at pick time.
// Gated by the same Beta CONTENT-WRITER gate the product picker uses; read-only, nothing is sent.
// Voice canon: no em dashes.

import type { ActionResult } from '@/lib/action-result'
import { ok, fail } from '@/lib/action-result'
import { writerGate } from '@/lib/outbound/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listSpaceEventSnapshots,
  listSpaceCircleSnapshots,
  type EventCardSnapshot,
  type CircleCardSnapshot,
} from '@/lib/email-studio/data-blocks'

/** A Space the editor can pick events or circles from. */
export interface PickerSpace {
  id: string
  label: string
  /** A secondary line (the slug) so two same-named Spaces are still distinguishable. */
  sublabel: string
}

export type EventOption = EventCardSnapshot & { id: string }
export type CircleOption = CircleCardSnapshot & { id: string }

const MAX_SPACES = 8

/** Search Spaces by name. Fail-safe: a blank or one-character query returns nothing. */
export async function searchPickerSpacesAction(query: string): Promise<ActionResult<PickerSpace[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  // Strip the characters that would break the ilike pattern (% and _ are wildcards).
  const safe = query.trim().replace(/[,()%_*]/g, ' ').trim()
  if (safe.length < 2) return ok([])
  const { data } = await createAdminClient().from('spaces').select('id, name, slug').ilike('name', `%${safe}%`).limit(MAX_SPACES)
  return ok(
    ((data ?? []) as Array<{ id: string; name: string | null; slug: string | null }>).map((r) => ({
      id: String(r.id),
      label: r.name || 'A Space',
      sublabel: r.slug ? `/${r.slug}` : 'Space',
    })),
  )
}

/** One Space's upcoming events as pick-ready options. Fail-safe: an unknown Space returns []. */
export async function listSpaceEventsAction(spaceId: string): Promise<ActionResult<EventOption[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const id = spaceId?.trim()
  if (!id) return ok([])
  return ok(await listSpaceEventSnapshots(id))
}

/** One Space's live circles as pick-ready options. Fail-safe: an unknown Space returns []. */
export async function listSpaceCirclesAction(spaceId: string): Promise<ActionResult<CircleOption[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const id = spaceId?.trim()
  if (!id) return ok([])
  return ok(await listSpaceCircleSnapshots(id))
}
