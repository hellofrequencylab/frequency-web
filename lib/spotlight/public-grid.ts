import type { EntityLayout, RowDef } from '@/lib/entity-blocks/layout'

// THE PUBLIC SPOTLIGHT STARTER. The member grid's `basic` starter (links, then Top Friends) is the IN-APP
// default: there the profile chrome already renders the bio. The public /spotlight page hides the header
// bio (the `about` block owns it) and has no other chrome, so a member who never saved a grid got a page
// with no bio and none of the blocks they authored in meta.spotlight.layout (headings, images, galleries,
// quotes, embeds) — the content was kept but never placed. This builds the public default from what the
// member actually wrote: About, then each authored block type in first-seen order (each type block renders
// every instance of that type), then Links and Top Friends if not already placed. A SAVED grid always wins.
// Guestbook stays out: its block reads the session, and this page is ISR with no cookies().

/** The block types the public default always ends with when the member did not author them. */
const TAIL = ['links', 'memberEvents', 'tip', 'memberContributions'] as const

export function publicSpotlightGrid(
  saved: EntityLayout | null,
  authored: readonly { type: string }[],
): EntityLayout | null {
  if (saved?.rows && saved.rows.length) return saved
  if (saved && (saved.template || saved.slots || saved.order)) return saved

  const ids: string[] = ['about']
  for (const block of authored) {
    if (!ids.includes(block.type)) ids.push(block.type)
  }
  for (const id of TAIL) {
    if (!ids.includes(id)) ids.push(id)
  }
  const rows: RowDef[] = ids.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] }))
  return { ...(saved ?? {}), rows }
}

/** The "On Frequency" body under a configured link-in-bio page: the member's grid minus the blocks the page
 *  already owns (the bio, the link list and Top Friends). A saved grid without rows (an older template or slots
 *  shape) falls back to the public starter, so nothing is ever blank. Returns null when nothing is left. */
export function frequencyExtrasGrid(
  saved: EntityLayout | null,
  authored: readonly { type: string }[],
  owned: ReadonlySet<string>,
): EntityLayout | null {
  const base = publicSpotlightGrid(saved, authored)
  const source = base?.rows?.length ? base : publicSpotlightGrid(null, authored)
  const rows = (source?.rows ?? [])
    .map((r) => ({ ...r, cells: r.cells.map((cell) => cell.filter((id) => !owned.has(id))) }))
    .filter((r) => r.cells.some((cell) => cell.length > 0))
  return rows.length ? { ...(source ?? {}), rows } : null
}
