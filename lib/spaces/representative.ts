// Pick a REPRESENTATIVE Space of a given entity type, for the staff "preview as entity role" flow
// (item JAN-01, ADR-340). An entity role only has meaning INSIDE a Space, so previewing one means
// landing the staffer in a real Space of that `type`. This reader answers "which Space best
// represents this role right now" without ever standing one up or mutating anything.
//
// SERVER-ONLY: it reads through the discovery helper (admin client). The PURE entity-role helpers
// (the provisionable set + the validator, safe in a client bundle) live in ./entity-roles and are
// re-exported here so server callers can keep importing both from one place.
//
// SELECTION: a networked, active, non-root Space of the requested type. We read it through the
// shared discovery helper so the choice rides the SAME visibility boundary the public directory
// uses (`visibility = 'network'`, root excluded). That keeps the preview faithful (the staffer sees
// exactly what a member sees) and tenancy-safe (no Private/White-Label Space is ever surfaced).
//
// FAIL-SAFE by construction: any error, or simply no networked Space of that type yet, yields
// `null` (NOT a throw), so the caller can degrade to an on-voice "no space yet" note. A role no one
// has provisioned a networked Space for behaves the same for free: the reader returns null and the
// selector says so, rather than erroring.

import { cache } from 'react'
import { listNetworkedSpaces } from './discovery'
import type { SpaceType } from './types'

export {
  previewableEntityRoles,
  isPreviewableEntityRole,
  type EntityRolePreview,
} from './entity-roles'

/** The minimal anchor the preview navigation needs: the slug to route to and the type it stands for. */
export interface RepresentativeSpace {
  slug: string
  /** Brand/display name, resolved by the discovery reader (brand name when set, else the plain name). */
  name: string
  type: SpaceType
}

/**
 * A representative networked Space of `type`, or null when none exists yet. REQUEST-CACHED on the
 * type. Reads only the public-directory set (networked + active, root excluded), so the pick is
 * always one a member could browse to and never leaks a Private Space. Fail-safe: the underlying
 * discovery read already returns `[]` on any error, so this returns null rather than throwing.
 */
export const representativeSpaceOfType = cache(
  async (type: SpaceType): Promise<RepresentativeSpace | null> => {
    // listNetworkedSpaces is itself fail-safe ([] on error) and already filters to
    // visibility='network', status='active', and excludes the root space. Narrowing by `type` keeps
    // the work cheap and the pick on-boundary. Name order gives a stable, deterministic choice.
    const matches = await listNetworkedSpaces({ type })
    const first = matches[0]
    if (!first) return null
    return { slug: first.slug, name: first.name, type: first.type }
  },
)
