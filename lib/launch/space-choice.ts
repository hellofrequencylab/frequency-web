// WHICH SPACE THE LAUNCH IS FOR (the pure half). A person who already has Spaces should not be asked to start over:
// the launch lists them, says which already have a Spotlight, and attaches the one they pick, so what exists fills the
// page and whatever they change is written back to the same records. PURE, so a probe can run it under node.

export interface OwnedSpace {
  id: string
  slug: string
  name: string
  /** The Space's Spotlight is published. */
  spotlightLive: boolean
}

export interface SpaceChoice {
  value: string
  title: string
  note: string
}

/** The value that means "make me a new one". */
export const NEW_SPACE = 'new'

/** The choices on the page: the person's Spaces, the ones with a live Spotlight first, then "a new one". */
export function spaceChoices(spaces: readonly OwnedSpace[]): SpaceChoice[] {
  const ordered = [...spaces].sort((a, b) => Number(b.spotlightLive) - Number(a.spotlightLive) || a.name.localeCompare(b.name))
  return [
    ...ordered.map((s) => ({ value: s.id, title: s.name, note: s.spotlightLive ? 'Spotlight is live' : 'No Spotlight yet' })),
    { value: NEW_SPACE, title: 'A new one', note: 'Start fresh with a new Space' },
  ]
}

/** The Space a submitted value names, only when it is one of the person's own; NEW_SPACE for a new one; else null. */
export function parseSpaceChoice(raw: unknown, spaces: readonly OwnedSpace[]): OwnedSpace | typeof NEW_SPACE | null {
  if (raw === NEW_SPACE) return NEW_SPACE
  return typeof raw === 'string' ? (spaces.find((s) => s.id === raw) ?? null) : null
}
