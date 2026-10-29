// WHAT I'M PART OF (SPL-04), the PURE half: the shapes the public Spotlight carries for the Programs block,
// the opt-in switches, the privacy filters and the cap. No IO, no React, so the rules unit-test without a
// database and the client-safe block file can import the types. The reads live in ./programs.ts.
//
// PRIVACY IS THE POINT. The public page is anonymous and reads through the admin client, where RLS does not
// fire, so every rule below is the enforcement. Only PUBLIC rows may cross: an open, listed Circle; a
// networked Space; a public, approved, published Journey. Never a count of people, never who else is in it,
// never a Circle topic, persona, or anything about wellness.

/** Rows shown per kind. A glance at what someone is part of, not a second directory. */
export const PROGRAMS_CAP = 6

export interface ProgramLink {
  id: string
  name: string
  href: string
}

interface ProgramJourney extends ProgramLink {
  /** Finished the whole Journey. False means they are on it now. An ongoing Journey is never "finished". */
  finished: boolean
}

export interface SpotlightPrograms {
  circles: ProgramLink[]
  journeys: ProgramJourney[]
  spaces: ProgramLink[]
}

export const EMPTY_PROGRAMS: SpotlightPrograms = { circles: [], journeys: [], spaces: [] }

/** The member's three switches. All default OFF: a block with nothing switched on shows nothing. */
export interface ProgramsOptIn {
  circles: boolean
  journeys: boolean
  spaces: boolean
}

const PROGRAMS_OFF: ProgramsOptIn = { circles: false, journeys: false, spaces: false }

/** Read the switches off a block's authored content. Strictly `=== true`, so a missing, malformed or
 *  stringly-typed value is OFF. */
export function programsOptIn(content: unknown): ProgramsOptIn {
  const c = (content && typeof content === 'object' ? content : {}) as Record<string, unknown>
  return {
    circles: c.showCircles === true,
    journeys: c.showJourneys === true,
    spaces: c.showSpaces === true,
  }
}

/** True when any switch is on. */
export function anyProgramsOn(o: ProgramsOptIn): boolean {
  return o.circles || o.journeys || o.spaces
}

interface GridLike {
  content?: Record<string, Record<string, unknown>>
  nodes?: { rows?: { cells: { type: string; content?: Record<string, unknown>; hidden?: boolean }[][] }[] }
}

/** The union of switches across every placement of the block in a saved grid (the type-keyed bag and each
 *  node). The reader asks this BEFORE it queries, so a member who never switched anything on costs no read. */
export function programsOptInFromGrid(grid: GridLike | null | undefined): ProgramsOptIn {
  if (!grid) return PROGRAMS_OFF
  const bags: unknown[] = [grid.content?.memberPrograms]
  for (const row of grid.nodes?.rows ?? []) {
    for (const cell of row.cells) {
      for (const n of cell) if (n.type === 'memberPrograms' && n.hidden !== true) bags.push(n.content)
    }
  }
  return bags.map(programsOptIn).reduce(
    (a, b) => ({ circles: a.circles || b.circles, journeys: a.journeys || b.journeys, spaces: a.spaces || b.spaces }),
    PROGRAMS_OFF,
  )
}

/** The Space wall, in memory: a row belongs to no real (possibly private) Space when it has no space or
 *  sits in the ROOT tenant. Same rule as lib/people/associations.ts. Under-showing is the right failure. */
function unwalled(spaceId: string | null | undefined, rootSpaceId: string | null): boolean {
  if (spaceId == null) return true
  return !!rootSpaceId && spaceId === rootSpaceId
}

export interface CircleRow {
  id: string
  name: string
  slug: string
  unlisted: boolean | null
  access: string | null
  status: string | null
  space_id: string | null
}
export interface SpaceRow {
  id: string
  name: string
  slug: string
  visibility: string | null
  status: string | null
  network_connected: boolean | null
  type: string | null
}
export interface PlanRow {
  id: string
  title: string
  slug: string
  visibility: string | null
  status: string | null
  published_at: string | null
  space_id: string | null
  ongoing: boolean | null
}

const LISTABLE_CIRCLE = new Set(['forming', 'active'])

/** A Circle anyone may see: open to enter, listed in browse, forming or active, and not inside a private Space. */
function isPublicCircle(c: CircleRow | null | undefined, rootSpaceId: string | null): c is CircleRow {
  return (
    !!c &&
    !!c.slug &&
    c.access === 'open' &&
    c.unlisted === false &&
    LISTABLE_CIRCLE.has(c.status ?? '') &&
    unwalled(c.space_id, rootSpaceId)
  )
}

/** A Space the directory lists: active, networked, connected, and not the root tenant. */
function isPublicSpace(s: SpaceRow | null | undefined): s is SpaceRow {
  return (
    !!s &&
    !!s.slug &&
    s.status === 'active' &&
    s.visibility === 'network' &&
    s.network_connected === true &&
    s.type !== 'root'
  )
}

/** A Journey the library publishes: public, approved, with a publish date, outside private Spaces. */
function isPublicPlan(p: PlanRow | null | undefined, rootSpaceId: string | null): p is PlanRow {
  return (
    !!p &&
    !!p.slug &&
    p.visibility === 'public' &&
    p.status === 'approved' &&
    !!p.published_at &&
    unwalled(p.space_id, rootSpaceId)
  )
}

/** Shape the three raw reads into the allowlisted output: public rows only, de-duplicated, capped. Journeys
 *  the member is on come before finished ones. Every row is re-checked here even though the queries already
 *  filter, so a dropped predicate cannot leak. */
export function shapePrograms(
  raw: {
    circles: (CircleRow | null)[]
    spaces: (SpaceRow | null)[]
    journeys: { plan: PlanRow | null; completed_at: string | null }[]
  },
  rootSpaceId: string | null,
): SpotlightPrograms {
  const unique = <T extends { id: string }>(rows: T[]): T[] => {
    const seen = new Set<string>()
    return rows.filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  }

  const circles = unique(raw.circles.filter((c): c is CircleRow => isPublicCircle(c, rootSpaceId)))
    .slice(0, PROGRAMS_CAP)
    .map((c) => ({ id: c.id, name: c.name, href: `/circles/${c.slug}` }))

  const spaces = unique(raw.spaces.filter((s): s is SpaceRow => isPublicSpace(s)))
    .slice(0, PROGRAMS_CAP)
    .map((s) => ({ id: s.id, name: s.name, href: `/spaces/${s.slug}` }))

  const plans = raw.journeys.flatMap((j) =>
    isPublicPlan(j.plan, rootSpaceId)
      ? [{ ...j.plan, finished: !!j.completed_at && j.plan.ongoing !== true }]
      : [],
  )
  const journeys = unique(plans)
    .sort((a, b) => Number(a.finished) - Number(b.finished))
    .slice(0, PROGRAMS_CAP)
    .map((p) => ({ id: p.id, name: p.title, href: `/journeys/${p.slug}`, finished: p.finished }))

  return { circles, journeys, spaces }
}
