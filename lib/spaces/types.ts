// The Space domain model (ADR-249/SPACES.md, ADR-250 step 6). A Space is a white-label
// tenant of the one app/DB: its own type, brand/skin, domain, entity (money partition), a
// network-connected switch, and the set of registered verticals it turns on.

export type SpaceType =
  | 'root'
  | 'practitioner'
  | 'business'
  | 'organization'
  | 'lab'
  | 'partner'
  | 'coaching'

export type SpaceStatus = 'active' | 'suspended' | 'archived'

export interface Space {
  id: string
  /** URL handle. */
  slug: string
  name: string
  type: SpaceType
  status: SpaceStatus
  /** The money partition this Space's commerce belongs to (entities.id). */
  entityId: string
  /** The [data-skin] token set applied to this Space's surfaces. */
  skin: string
  /** Custom domain / subdomain, or null when served under the root. */
  domain: string | null
  /** The switch (ADR-249 §3): on = ported into the shared network. */
  networkConnected: boolean
  /** Registered vertical ids ('market', …) this Space exposes (root exposes all). */
  enabledVerticals: string[]
  /** The operator who owns this Space (null for the root / platform spaces). */
  ownerProfileId: string | null
}
