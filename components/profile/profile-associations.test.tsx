import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The associations panel's PRIVACY BOUNDARY, asserted on the RENDERED MARKUP (ADR-895, plan step 22).
//
// Three test files, three different jobs, and none of them substitutes for another:
//   · lib/people/associations.test.ts             — the data matrix (which reads run for whom)
//   · components/profile/profile-associations-wiring.test.ts — the query predicates, as source text
//   · THIS FILE                                   — what each viewer's page actually SAYS
//
// Why the render layer needs its own boundary test: the data layer can be perfectly tiered and the
// component can still publish a private fact, because the panel does its own arithmetic on top of
// the tiers (which tiles survive, what the peek shows, what each tile's `title` sentence claims).
// A count leaks as surely as a list, and a count is a RENDER-layer artefact. So the assertions below
// are on strings a viewer could read off the screen, not on the shape of the returned object.
//
// The mock is at the ADMIN CLIENT, not at getProfileAssociations, so every render here runs the real
// tiering code end to end. Mocking the reader would have made this file assert that the component
// renders whatever it is handed — true, and worthless as a privacy proof.

const TARGET = 'target-0000-4000-a000-000000000001'
const SHARER = 'share-00000-4000-a000-000000000002'
const LONER = 'lone-000000-4000-a000-000000000003'
const JANITOR = 'janitor-000-4000-a000-000000000004'

const FUTURE = '2099-06-01T18:00:00.000Z'
const FUTURE_2 = '2099-06-08T18:00:00.000Z'
const FUTURE_3 = '2099-06-15T18:00:00.000Z'

// Every Circle the fake knows, keyed the way `readShared` / `readOwn` fetch them. The names are
// deliberately unlike each other so an assertion can prove ABSENCE, which is the only way to test a
// leak: "Dawn Patrol" appearing anywhere in a stranger's markup is the bug this panel exists to fix.
const CIRCLE = {
  c1: { id: 'c1', name: 'Dawn Patrol', slug: 'dawn-patrol' },
  c2: { id: 'c2', name: 'Sunrise Swim', slug: 'sunrise-swim' },
  c3: { id: 'c3', name: 'Grief Circle', slug: 'grief-circle' },
  c9: { id: 'c9', name: 'Viewer Only', slug: 'viewer-only' },
} as const

/** Names that are NEVER tier A. If one of these reaches a viewer who is not entitled to it, the
 *  panel has leaked, whatever the counts say. */
const PRIVATE_NAMES = [
  'Dawn Patrol', // the target is a member, not the host
  'Grief Circle', // ditto, and the name is the point
  'Cold Water', // a Channel the target follows
  'Harbor Studio', // a Space seat the target holds
  'Thirty Mornings', // a Journey the target is enrolled in
] as const

const failing = new Set<string>()
let empty = false

function builder(table: string) {
  const filters: Array<[string, string, unknown]> = []
  let select = ''
  let exact = false
  const has = (col: string) => filters.some((f) => f[1] === col)
  const valueOf = (col: string) => filters.find((f) => f[1] === col)?.[2]

  function rows(): Record<string, unknown>[] {
    if (empty) return []
    if (table === 'circles') {
      // Tier A reads by host; tiers B and C resolve a set of ids.
      if (has('host_id')) {
        return [
          { id: 'h1', name: 'Cold Plunge', slug: 'cold-plunge' },
          { id: 'h2', name: 'Trail Runs', slug: 'trail-runs' },
        ]
      }
      const ids = (valueOf('id') ?? []) as string[]
      return ids.map((id) => CIRCLE[id as keyof typeof CIRCLE]).filter(Boolean)
    }
    if (table === 'spaces') return [{ id: 's1', name: 'Wayfarer', slug: 'wayfarer' }]
    if (table === 'events') {
      // A weekly series (anchor + two dates) plus a one-off: FOUR rows, TWO gatherings.
      return [
        { id: 'e1', title: 'Cowork', slug: 'cowork', starts_at: FUTURE, is_cancelled: false, recurrence_type: 'weekly', recurrence_until: null, parent_event_id: null },
        { id: 'e2', title: 'Cowork', slug: 'cowork-2', starts_at: FUTURE_2, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: 'e1' },
        { id: 'e3', title: 'Cowork', slug: 'cowork-3', starts_at: FUTURE_3, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: 'e1' },
        { id: 'e9', title: 'Repair Cafe', slug: 'repair-cafe', starts_at: FUTURE, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: null },
      ]
    }
    if (table === 'journey_plans') return []
    if (table === 'practices') {
      return [
        { id: 'p1', title: 'Box Breathing', slug: 'box-breathing' },
        { id: 'p2', title: 'Body Scan', slug: 'body-scan' },
        { id: 'p3', title: 'Long Exhale', slug: 'long-exhale' },
      ]
    }
    if (table === 'market_listings') return []
    if (table === 'memberships') {
      // Tier C joins the circle row; tier B reads bare ids for two different people.
      if (select.includes('circles')) {
        return [{ circles: CIRCLE.c1 }, { circles: CIRCLE.c2 }, { circles: CIRCLE.c3 }]
      }
      const who = String(valueOf('profile_id') ?? '')
      if (who.startsWith('target')) return [{ circle_id: 'c1' }, { circle_id: 'c2' }, { circle_id: 'c3' }]
      if (who.startsWith('share')) return [{ circle_id: 'c2' }, { circle_id: 'c9' }]
      return [{ circle_id: 'c9' }]
    }
    if (table === 'topical_channel_memberships') return [{ topical_channels: { id: 'ch1', name: 'Cold Water' } }]
    if (table === 'space_members') return [{ spaces: { id: 's7', name: 'Harbor Studio', slug: 'harbor-studio' } }]
    if (table === 'journey_enrollments') return [{ journey_plans: { id: 'j5', title: 'Thirty Mornings', slug: 'thirty-mornings' } }]
    return []
  }

  const settle = () => {
    if (failing.has(table)) return { data: null, error: { message: 'boom' }, count: null }
    const data = rows()
    return { data, error: null, count: exact ? data.length : null }
  }

  const api = {
    select(cols: string, opts?: { count?: 'exact' }) {
      select = cols
      if (opts?.count === 'exact') exact = true
      return api
    },
    eq(col: string, val: unknown) { filters.push(['eq', col, val]); return api },
    neq(col: string, val: unknown) { filters.push(['neq', col, val]); return api },
    in(col: string, val: unknown) { filters.push(['in', col, val]); return api },
    is(col: string, val: unknown) { filters.push(['is', col, val]); return api },
    not(col: string, op: string, val: unknown) { filters.push(['not', col, val ?? op]); return api },
    gte(col: string, val: unknown) { filters.push(['gte', col, val]); return api },
    order() { return api },
    limit() { return api },
    then(resolve: (v: ReturnType<typeof settle>) => void) { resolve(settle()) },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

const { ProfileAssociations } = await import('./profile-associations')

// `readBuilt` is request-cached on the profile id, and vitest has no request scope, so a reused id
// would let one case's memoised answer stand in for the next case's reads. Every render gets a
// fresh target — the same discipline lib/people/associations.test.ts uses.
let n = 10
const nextTarget = () => `${TARGET.slice(0, -2)}${++n}`

/** Render the panel exactly as the profile page mounts it, for one viewer. */
async function view(opts: {
  viewerProfileId: string | null
  isOwner?: boolean
  blocked?: boolean
  profileId?: string
}): Promise<string> {
  const node = await ProfileAssociations({
    profileId: opts.profileId ?? nextTarget(),
    handle: 'ada',
    firstName: 'Ada',
    viewerProfileId: opts.viewerProfileId,
    isOwner: opts.isOwner ?? false,
    blocked: opts.blocked,
  })
  return node === null ? '' : renderToStaticMarkup(node)
}

/** Everything above tier B. Tiers B and C both open with `mt-4`, and the owner's copy legitimately
 *  differs from a visitor's, so the byte-identical claim is made about the tier-A region only. */
const tierA = (html: string) => html.split('<div class="mt-4')[0]!.replace(/<\/section>$/, '')

beforeEach(() => {
  failing.clear()
  empty = false
})

describe('every viewer gets a different, correct panel', () => {
  it('shows a signed-out visitor tier A and nothing else', async () => {
    const html = await view({ viewerProfileId: null })

    // Tier A is there, in the visitor's voice.
    expect(html).toContain('What Ada runs')
    expect(html).toContain('Cold Plunge')
    expect(html).toContain('Wayfarer')
    expect(html).toContain('Cowork')

    // Tier B and tier C are not merely hidden, they are absent.
    expect(html).not.toContain('Circles you are both in')
    expect(html).not.toContain('Only you can see this')
    expect(html).not.toContain('Unpublished and private items stay off this list.')

    // And nothing owner-private is named.
    for (const name of PRIVATE_NAMES) expect(html).not.toContain(name)
  })

  it('says the same thing, byte for byte, to a signed-in stranger and to a janitor', async () => {
    const anon = await view({ viewerProfileId: null })
    const stranger = await view({ viewerProfileId: LONER })
    const janitor = await view({ viewerProfileId: JANITOR })

    // Sameness is the proof. If anyone ever branches tier A on the viewer — or lets an empty tier B
    // leave a heading, a divider or a zero behind — these go red. Staff power is not a reason to
    // publish a member's private associations on a page anyone can screenshot.
    expect(stranger).toBe(anon)
    expect(janitor).toBe(anon)
  })

  it('names the shared Circle to a co-member, and names only that one', async () => {
    const stranger = await view({ viewerProfileId: LONER })
    const sharer = await view({ viewerProfileId: SHARER })

    expect(sharer).toContain('Circles you are both in')
    expect(sharer).toContain('Sunrise Swim')
    expect(sharer).toContain('/circles/sunrise-swim')

    // The target is in three Circles. The viewer shares ONE. The other two must not appear, and
    // neither must the viewer's own unshared Circle.
    expect(sharer).not.toContain('Dawn Patrol')
    expect(sharer).not.toContain('Grief Circle')
    expect(sharer).not.toContain('Viewer Only')

    // Tier A did not move an inch because the viewer happens to be a co-member.
    expect(tierA(sharer)).toBe(tierA(stranger))
  })

  it('withholds tier B from a blocked viewer, leaving the stranger view exactly', async () => {
    const stranger = await view({ viewerProfileId: LONER })
    const blocked = await view({ viewerProfileId: SHARER, blocked: true })
    // A blocked viewer shares a Circle with the target, and still gets only the public picture.
    expect(blocked).toBe(stranger)
    expect(blocked).not.toContain('Sunrise Swim')
  })

  it('gives the owner their own full picture, marked as private, and no tier B', async () => {
    const html = await view({ viewerProfileId: TARGET, isOwner: true })

    expect(html).toContain('What you run')
    expect(html).toContain('Only you can see this')
    expect(html).toContain('aria-label="Only you can see this"')
    expect(html).toContain('Circles you are in')
    expect(html).toContain('Channels you follow')
    expect(html).toContain('Space seats you hold')
    expect(html).toContain('Journeys you joined')
    for (const name of PRIVATE_NAMES) expect(html).toContain(name)

    // Tier B is the answer for a visitor, not for the owner looking at their own page.
    expect(html).not.toContain('Circles you are both in')
    expect(html).toContain('Unpublished and private items stay off this list.')
  })
})

describe('the count is tiered as strictly as the list', () => {
  it('never prints a number computed from rows the viewer cannot list', async () => {
    const html = await view({ viewerProfileId: LONER })

    // The target HOSTS two Circles and is a MEMBER of three. A visitor is entitled to the first
    // number and not the second, so "2" is the only Circles figure that may appear.
    expect(html).toContain('Ada hosts 2 Circles.')
    expect(html).not.toContain('3 Circles')

    // The Events tile counts gatherings, not dates: four rows, two upcoming Events.
    expect(html).toContain('Ada hosts 2 upcoming Events.')
    expect(html).not.toContain('4 upcoming Events')
  })

  it('does not inflate a tier-A count with the viewer-scoped tier', async () => {
    const sharer = await view({ viewerProfileId: SHARER })
    // The shared Circle is a tier-B fact. Rolling it into the Circles tile would republish it to
    // anyone the viewer shows their screen to, and would make the tile disagree with a stranger's.
    expect(sharer).toContain('Ada hosts 2 Circles.')
    expect(sharer).not.toContain('3 Circles')
  })

  it('offers no "and N more" affordance, which would count what it will not name', async () => {
    const html = await view({ viewerProfileId: LONER })
    expect(html).not.toMatch(/\bmore\b/i)
    // The peek is capped across kinds, and the rows past the cap are dropped, not summarised.
    const rows = html.split('<li>').length - 1
    expect(rows).toBe(6)
    expect(html).toContain('Box Breathing')
    expect(html).not.toContain('Body Scan')
    expect(html).not.toContain('Long Exhale')
  })

  it('omits a failed read rather than publishing it as a zero', async () => {
    failing.add('practices')
    const html = await view({ viewerProfileId: null })
    // "Practices 0" would be a false statement about the member, produced by a DB hiccup.
    expect(html).not.toContain('Box Breathing')
    expect(html).not.toContain('Practices.')
    // The other five kinds are untouched: one bad table shrinks the panel, it does not empty it.
    expect(html).toContain('Ada hosts 2 Circles.')
    expect(html).toContain('Wayfarer')
  })

  it('omits a genuinely-zero kind instead of rendering a grid of zeroes', async () => {
    const html = await view({ viewerProfileId: null })
    // Journeys and Classifieds have no rows here.
    expect(html).not.toContain('Journeys.')
    expect(html).not.toContain('Classifieds listings.')
  })
})

describe('the empty states', () => {
  it('renders nothing at all for a visitor with no tier A and no shared Circle', async () => {
    empty = true
    // docs/PROFILE-REDESIGN-PLAN.md §5.3 "Zero states": a visitor with tiers A and B both empty gets
    // no section — not a heading over a blank region, and not a zero. An empty-state card here would
    // put a permanent "nothing in common" notice on nearly every profile in the community.
    expect(await view({ viewerProfileId: null })).toBe('')
    expect(await view({ viewerProfileId: LONER })).toBe('')
  })

  it('gives the owner three invitations rather than an empty grid', async () => {
    empty = true
    const html = await view({ viewerProfileId: TARGET, isOwner: true })
    expect(html).toContain('What you run')
    expect(html).toContain('Host a Circle')
    expect(html).toContain('Host an event')
    expect(html).toContain('Publish a Journey')
    expect(html).toContain('Unpublished and private items stay off this list.')
    // No tiles, so no zeroes.
    expect(html).not.toContain('Circles.')
    expect(html).not.toContain('Circle.')
  })
})

describe('accessibility', () => {
  it('carries exactly one heading, from SectionHeader, and no hand-rolled one', async () => {
    const html = await view({ viewerProfileId: TARGET, isOwner: true })
    expect(html.split('<h2').length - 1).toBe(1)
    expect(html).not.toContain('<h3')
    // The owner's private region announces its boundary rather than only colouring it.
    expect(html).toContain('aria-label="Only you can see this"')
  })

  it('gives every truncating peek row a recoverable full label', async () => {
    const html = await view({ viewerProfileId: null })
    // The visible label is `truncate`, so the title is the only place the whole name survives.
    expect(html).toContain('title="Cold Plunge (Circle)"')
    expect(html).toContain('title="Wayfarer (Space)"')
  })
})
