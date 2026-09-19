// ─────────────────────────────────────────────────────────────────────────────
// THE DEFAULT HOST SPACE (LIVE-376, ADR-1413).
//
// A host who owns exactly one real Space almost certainly means that Space. The create form
// already offered "Spaces you run" under "Where does it live?", and the settings rail already
// had "Hosted by". Both were easy to miss: the form defaulted to Public, the Spark never asked,
// and a missing pick stamped the ROOT via events_default_space_id / stampEventSpaceId.
//
// This is the one rule those surfaces share. PURE: ids in, an id or nothing out. The page ranks
// an explicit `?space=` / Duplicate / `?circle=` ABOVE this, because a deep link is a choice.
// The database trigger stays: someone with no Space still lands on the root, which is right.
// ─────────────────────────────────────────────────────────────────────────────

export type HostableSpaceRef = {
  id: string
}

/**
 * The Space a new event should attach to when the host did not name one.
 *
 * - Zero hostable Spaces (none, or only the root) → undefined. Public / root stays the default.
 * - Exactly one non-root Space → that Space.
 * - Two or more → undefined. The picker has to ask; guessing is how the wrong calendar gets it.
 */
export function defaultEventHostSpaceId(
  spaces: readonly HostableSpaceRef[],
  opts: { rootId?: string | null } = {},
): string | undefined {
  const rootId = opts.rootId ?? null
  const hostable = spaces.filter((s) => {
    const id = typeof s.id === 'string' ? s.id.trim() : ''
    return id.length > 0 && id !== rootId
  })
  if (hostable.length === 1) return hostable[0]!.id
  return undefined
}
