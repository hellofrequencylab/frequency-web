// DEFAULT HOST SCOPE — which Circle or Space a new event should land on (LIVE-376).
//
// The create page used to honor `?space=` / `?circle=` / Duplicate and otherwise leave the
// selector empty. The events_default_space_id trigger then stamped the ROOT Frequency Space,
// so a host with exactly one Space created "personal" events that never showed on it.
//
// PURE. An owner of exactly one Space they run means that Space, unless a more specific
// deep link or Duplicate already named one.

export type ScopeOption = { id: string }

export function defaultEventHostScope(args: {
  spaceParam?: string | null
  circleParam?: string | null
  duplicateSpaceId?: string
  spaces: readonly ScopeOption[]
  circles: readonly ScopeOption[]
}): string | undefined {
  const spaceParam = args.spaceParam || undefined
  const circleParam = args.circleParam || undefined
  if (spaceParam && args.spaces.some((s) => s.id === spaceParam)) return spaceParam
  if (args.duplicateSpaceId && args.spaces.some((s) => s.id === args.duplicateSpaceId)) {
    return args.duplicateSpaceId
  }
  if (circleParam && args.circles.some((c) => c.id === circleParam)) return circleParam
  if (args.spaces.length === 1) return args.spaces[0].id
  return undefined
}
