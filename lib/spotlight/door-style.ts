// HOW AN OWNER'S LINK IS DRAWN, ON EVERY THEME (LIVE-2487). PURE.
// The Links block lets the owner draw each link as a card (the default door), a button, or a plain text link, and mark
// one as the main button (LIVE-2454). New World honoured it first (LIVE-2486); every other Spotlight theme reads the
// same three helpers, so the setting works whatever theme a member picks.

/** How a door is drawn. A door with no style is a card, the theme's own door. */
export type DoorStyle = 'button' | 'card' | 'text'

/** A stored style as a door style; `main` and anything unknown are not door styles. */
function doorStyle(v: unknown): DoorStyle | undefined {
  return v === 'button' || v === 'card' || v === 'text' ? v : undefined
}

/** The style a link is drawn in: its own, else the Links block's default. */
export function linkDoorStyle(link: { style?: unknown }, blockDefault?: unknown): DoorStyle | undefined {
  return doorStyle(link.style) ?? doorStyle(blockDefault)
}

/** Consecutive doors of one style, in order, so a theme draws a row of text links together and each card as a card. */
export function doorRuns<D extends { style?: DoorStyle }>(doors: readonly D[]): { kind: DoorStyle; doors: D[] }[] {
  const runs: { kind: DoorStyle; doors: D[] }[] = []
  for (const d of doors) {
    const kind = d.style ?? 'card'
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.doors.push(d)
    else runs.push({ kind, doors: [d] })
  }
  return runs
}

/** The link the owner marked as the main button, if any. */
export function markedMainLink<L extends { style?: unknown }>(links: readonly L[]): L | null {
  return links.find((l) => l.style === 'main') ?? null
}

/** The link that becomes the main button when there is no Button block: the one marked main, else the first link
 *  that is drawn as neither a text link nor a card (a link picked as text never turns into the big button). */
export function mainLink<L extends { style?: unknown }>(links: readonly L[], blockDefault?: unknown): L | null {
  return markedMainLink(links) ?? links.find((l) => { const s = linkDoorStyle(l, blockDefault); return s !== 'text' && s !== 'card' }) ?? null
}
