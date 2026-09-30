// ENTITY RAIL READS (ADR-1685, LIVE-655) — which server reads a circle, event, hub, nexus or practice
// rail needs, keyed by the rail module that needs them. Pure data, no imports: the client provider
// (components/admin/modules/entity-rail-data.tsx) reads it to decide what ONE bundled request asks
// for, and the bundle action (components/admin/modules/entity-rail-actions.ts) holds a getter for
// every read named here, so the two cannot name different sets.
//
// WHY A TABLE AND NOT "FETCH EVERYTHING". The rail mounts only the modules the viewer's catalog,
// gates and stored overrides leave in it. Asking for the reads of the modules actually mounted keeps
// the server work at or below what the self-fetching modules did, never above it. A module whose read
// is missing here (a new module, a renamed id) simply self-fetches, exactly as before: the table can
// only ever save work, never lose data.
//
// hub.layout and nexus.layout are absent on purpose: both are `render: 'link'` rows since ADR-846, so
// no inline body mounts for them and they read nothing.
//
// Module ids are the catalog ids the rail renders (lib/admin/modules/registry.ts), plus the rail's
// folded extras, which settings-panel.tsx ids as `extra:<slot>:<index>`; entityRailReadsFor strips
// the index, so `extra:engage` is the Circle Quest block and `extra:danger` the event Danger zone.

export type EntityRailKind = 'circle' | 'event' | 'hub' | 'nexus' | 'practice'

/** Every read each kind's bundle can serve. The bundle action's getter table is typed against this. */
export const ENTITY_RAIL_READ_KEYS = {
  circle: ['admin', 'placeTime', 'people', 'engage', 'practice', 'journeyRun', 'insights', 'move'],
  event: ['admin', 'coreStats', 'people'],
  hub: ['admin', 'people', 'insights'],
  nexus: ['admin', 'people', 'insights'],
  practice: ['admin', 'insights'],
} as const satisfies Record<EntityRailKind, readonly string[]>

export type EntityRailReadKey<K extends EntityRailKind> = (typeof ENTITY_RAIL_READ_KEYS)[K][number]

type ModuleReads = { [K in EntityRailKind]: Record<string, readonly EntityRailReadKey<K>[]> }

/** The reads each mounted rail module makes on its first render, by module id. */
export const ENTITY_RAIL_MODULE_READS: ModuleReads = {
  circle: {
    'circle.guided': ['admin'],
    'circle.settings': ['admin'],
    'circle.placeAndTime': ['placeTime'],
    'circle.people': ['people'],
    // One Engage box stacks three bodies (module-map.tsx): challenges, this week's practice, a Run.
    'circle.engage': ['engage', 'practice', 'journeyRun'],
    'circle.insights': ['insights'],
    'circle.transfer': ['move'],
    'extra:engage': ['admin'],
  },
  event: {
    'event.guided': ['admin'],
    'event.settings': ['admin', 'coreStats'],
    'event.people': ['people'],
    'extra:danger': ['admin'],
  },
  hub: {
    'hub.settings': ['admin'],
    'hub.people': ['people'],
    'hub.insights': ['insights'],
    'hub.danger': ['admin'],
  },
  nexus: {
    'nexus.settings': ['admin'],
    'nexus.people': ['people'],
    'nexus.insights': ['insights'],
    'nexus.danger': ['admin'],
  },
  practice: {
    'practice.guided': ['admin'],
    'practice.settings': ['admin'],
    'practice.insights': ['insights'],
  },
}

/** The route each kind's modules read their key from. Each module matches the SAME pattern, so the
 *  provider's key and a module's key are one string. */
const ROUTES: readonly { kind: EntityRailKind; re: RegExp }[] = [
  { kind: 'circle', re: /^\/circles\/([^/]+)/ },
  { kind: 'event', re: /^\/events\/([^/]+)/ },
  { kind: 'hub', re: /^\/hubs\/([^/]+)/ },
  { kind: 'nexus', re: /^\/nexuses\/([^/]+)/ },
  { kind: 'practice', re: /^\/practices\/([^/]+)/ },
]

/** The entity a rail on this path manages (kind + the slug or id its modules read), or null. */
export function entityRailRoute(pathname: string): { kind: EntityRailKind; key: string } | null {
  for (const { kind, re } of ROUTES) {
    const key = pathname.match(re)?.[1]
    if (key) return { kind, key }
  }
  return null
}

/** The distinct reads the given mounted modules make, in the kind's canonical order. */
export function entityRailReadsFor(kind: EntityRailKind, moduleIds: readonly string[]): string[] {
  const table: Record<string, readonly string[]> = ENTITY_RAIL_MODULE_READS[kind]
  const wanted = new Set<string>()
  for (const raw of moduleIds) {
    const id = raw.startsWith('extra:') ? raw.replace(/:\d+$/, '') : raw
    for (const read of table[id] ?? []) wanted.add(read)
  }
  return (ENTITY_RAIL_READ_KEYS[kind] as readonly string[]).filter((r) => wanted.has(r))
}
