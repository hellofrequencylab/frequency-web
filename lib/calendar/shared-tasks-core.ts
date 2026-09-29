// SHARED TO-DOS, the pure half (PROG-CAL7 Together, LIVE-544). A to-do belongs to its Plan's host
// Space; a guest holding an accepted share of the Plan sees it too, marked with the host's name,
// on one list with its own rows. The IO lives in lib/calendar/shared-tasks.ts.

import type { CrmTask } from '@/lib/crm/tasks-core'

/** One person either team may hand a to-do to. */
export interface AssigneeChoice {
  value: string
  label: string
}

/**
 * One list: this Space's own rows first, then the to-dos of Plans shared with it, each marked with
 * the host Space's name. A row already on the own list (the host reading its own Plan) is never
 * doubled, and a shared row whose Plan is not in the map is dropped rather than shown unowned.
 */
export function mergeSharedTasks(
  own: readonly CrmTask[],
  shared: readonly CrmTask[],
  hostNameByPlan: ReadonlyMap<string, string | null>,
): CrmTask[] {
  const seen = new Set(own.map((t) => t.id))
  const out: CrmTask[] = [...own]
  for (const t of shared) {
    if (seen.has(t.id) || !t.planId || !hostNameByPlan.has(t.planId)) continue
    seen.add(t.id)
    out.push({ ...t, sharedFrom: hostNameByPlan.get(t.planId) ?? 'another Space' })
  }
  return out
}

/**
 * The picker's options: every person of both teams by name, one entry per person even when they
 * sit on both Spaces, sorted by name. A member whose profile the session could not read is
 * offered by their Space, so nobody is left out of the list for a regional wall.
 */
export function assigneeChoices(
  people: readonly { profileId: string; spaceName: string | null; displayName: string | null }[],
): AssigneeChoice[] {
  const byId = new Map<string, AssigneeChoice>()
  for (const p of people) {
    if (!p.profileId || byId.has(p.profileId)) continue
    const label = p.displayName?.trim() || (p.spaceName ? `A member of ${p.spaceName}` : 'A teammate')
    byId.set(p.profileId, { value: p.profileId, label: p.spaceName && p.displayName ? `${label} (${p.spaceName})` : label })
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** The words the record keeps when a to-do changes hands. */
export function assignmentWords(title: string, assigneeLabel: string | null): string {
  return assigneeLabel ? `Handed "${title}" to ${assigneeLabel}.` : `Left "${title}" with nobody for now.`
}
