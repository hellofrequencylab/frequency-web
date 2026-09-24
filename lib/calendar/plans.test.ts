import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  derivePlanStage,
  parsePlanFiles,
  PLAN_MAX_FILES,
  keepExplicitExceptions,
  parsePlanInput,
  parsePlanLinks,
  planTargetDef,
  PLAN_TARGETS,
} from './plans'
import { parseEntryInput } from './entries'

const ROOT = join(import.meta.dirname, '..', '..')

describe('parsePlanInput', () => {
  it('requires a title', () => {
    expect(parsePlanInput({ title: '  ' })).toEqual({ error: 'Give the Plan a title.' })
  })

  it('defaults a someday Plan to stage plan and target event', () => {
    const parsed = parsePlanInput({ title: 'Fall retreat' })
    expect('data' in parsed && parsed.data.stage).toBe('plan')
    expect('data' in parsed && parsed.data.target_kind).toBe('event')
  })

  it('accepts the title/date-only pencil contract when paired with an entry', () => {
    const plan = parsePlanInput({ title: '  Community dinner  ', stage: 'pencil', targetKind: 'event' })
    const entry = parseEntryInput({
      kind: 'pencil',
      title: 'Community dinner',
      allDay: true,
      startDate: '2027-06-14',
      endDate: '2027-06-14',
      timeZone: 'America/Los_Angeles',
      stage: 'pencil',
      blocksTime: false,
      showPublicly: false,
      planId: null,
    })
    expect('data' in plan && plan.data.stage).toBe('pencil')
    expect('data' in entry && entry.data.stage).toBe('pencil')
    expect('data' in entry && entry.data.starts_at).toBe('2027-06-14T00:00:00.000Z')
  })

  it('rejects an invalid date before any Plan or entry write', () => {
    const entry = parseEntryInput({
      kind: 'pencil',
      title: 'Community dinner',
      allDay: true,
      startDate: '2027-02-30',
      endDate: '2027-02-30',
      timeZone: 'UTC',
      stage: 'pencil',
      blocksTime: false,
      showPublicly: false,
      planId: null,
    })
    expect(entry).toEqual({ error: 'Pick a valid date.' })
  })
})

describe('parsePlanLinks', () => {
  it('keeps only http(s) urls', () => {
    expect(parsePlanLinks([{ url: 'javascript:alert(1)', label: 'x' }])).toEqual([])
    expect(parsePlanLinks([{ url: 'https://example.com/doc', label: 'Doc' }])).toEqual([
      { url: 'https://example.com/doc', label: 'Doc' },
    ])
  })
})

// ── A PLAN CAN HOLD IMAGES (PROG-CAL14) ──────────────────────────────────────────────────────
// The Images group stores REFERENCES to Loom assets, so the parser's job is to let nothing through
// that the Loom cannot trace: a stored id pointing at nothing would be counted by the usage index
// and would make safe delete refuse a delete for a phantom.

describe('parsePlanFiles', () => {
  const ID = 'aaaaaaaa-0000-4000-a000-00000000000a'
  const OTHER = 'bbbbbbbb-0000-4000-a000-00000000000b'

  it('keeps a real Loom reference, id and cached url together', () => {
    expect(parsePlanFiles([{ assetId: ID, url: 'https://cdn.test/flyer.jpg' }])).toEqual([
      { assetId: ID, url: 'https://cdn.test/flyer.jpg' },
    ])
  })

  it('drops a bare url, which is what an image field would have stored', () => {
    expect(parsePlanFiles(['https://cdn.test/flyer.jpg'])).toEqual([])
    expect(parsePlanFiles([{ url: 'https://cdn.test/flyer.jpg' }])).toEqual([])
  })

  it('drops an id that is not a Loom id, and a url that is not http(s)', () => {
    expect(parsePlanFiles([{ assetId: 'flyer.jpg', url: 'https://cdn.test/flyer.jpg' }])).toEqual([])
    expect(parsePlanFiles([{ assetId: ID, url: 'javascript:alert(1)' }])).toEqual([])
  })

  it('keeps one row per asset, so two refs to one picture do not double its usage count', () => {
    const twice = parsePlanFiles([
      { assetId: ID, url: 'https://cdn.test/a.jpg' },
      { assetId: ID, url: 'https://cdn.test/a.jpg?v=2' },
      { assetId: OTHER, url: 'https://cdn.test/b.jpg' },
    ])
    expect(twice.map((f) => f.assetId)).toEqual([ID, OTHER])
  })

  it('caps the collection where the drawer stops offering Add', () => {
    const many = Array.from({ length: PLAN_MAX_FILES + 4 }, (_, i) => ({
      assetId: `aaaaaaaa-0000-4000-a000-0000000000${String(i).padStart(2, '0')}`,
      url: `https://cdn.test/${i}.jpg`,
    }))
    expect(parsePlanFiles(many)).toHaveLength(PLAN_MAX_FILES)
  })

  it('reads anything that is not a list as no images at all', () => {
    expect(parsePlanFiles(null)).toEqual([])
    expect(parsePlanFiles({ assetId: ID, url: 'https://cdn.test/a.jpg' })).toEqual([])
  })

  it('is what parsePlanInput writes, so nothing reaches the column unvalidated', () => {
    const parsed = parsePlanInput({
      title: 'Fall retreat',
      files: [
        { assetId: ID, url: 'https://cdn.test/flyer.jpg' },
        { assetId: 'nope', url: 'https://cdn.test/other.jpg' },
      ],
    })
    expect('data' in parsed && parsed.data.files).toEqual([{ assetId: ID, url: 'https://cdn.test/flyer.jpg' }])
    // A Plan with no images is an empty list, never null: the column is `not null default '[]'`.
    const bare = parsePlanInput({ title: 'Fall retreat' })
    expect('data' in bare && bare.data.files).toEqual([])
  })
})

describe('derivePlanStage', () => {
  it('is plan when there are no dates', () => {
    expect(derivePlanStage({ entryStages: [], hasProductionEvent: false })).toBe('plan')
  })

  it('is pencil when every date is still a Pencil', () => {
    expect(derivePlanStage({ entryStages: ['pencil', 'pencil'], hasProductionEvent: false })).toBe('pencil')
  })

  it('is production once an event exists', () => {
    expect(derivePlanStage({ entryStages: ['planning'], hasProductionEvent: true })).toBe('production')
  })
})

describe('keepExplicitExceptions', () => {
  it('drops a skipped date and does not put it back', () => {
    expect(keepExplicitExceptions(['2026-10-04', '2026-10-18', '2026-11-01'], ['2026-10-18'])).toEqual([
      '2026-10-04',
      '2026-11-01',
    ])
  })
})

describe('planTargetDef', () => {
  const opts = { spaceId: '9f58e07e-8912-4c3e-8551-d15b275dc768', spaceSlug: 'royal-temple', planId: 'p', entryId: 'e' }

  it('opens the event Spark with plan and pencil ids', () => {
    const href = planTargetDef('event').createHref?.(opts)
    expect(href).toContain('/events/new?')
    expect(href).toContain('plan=p')
    expect(href).toContain('pencil=e')
  })

  it('has no Studio for maintenance', () => {
    expect(planTargetDef('maintenance').createHref).toBeNull()
  })

  // ── THE DOORS OPEN (PROG-CAL8) ────────────────────────────────────────────────────────────────
  // Two of the four "Make it a Production" doors were dead for three days because every one of them
  // was handed the Space's UUID while their destinations resolve a SLUG. The failure was silent in
  // exactly the way an href always is: nothing type-checks a string against a route.

  it('sends each door the identifier its destination actually resolves', () => {
    // /events/new compares ?space= against the ids of the scopes the caller runs: an id is correct.
    expect(planTargetDef('event').createHref?.(opts)).toContain(`space=${opts.spaceId}`)
    // /journeys/new resolves ?space= with getVisibleSpaceBySlug (.eq('slug', norm)). A UUID never
    // matched, so the page redirected to /spaces and the owner landed on the Spaces directory.
    expect(planTargetDef('journey').createHref?.(opts)).toContain(`space=${opts.spaceSlug}`)
  })

  it('never puts a UUID in a [slug] route segment, which is a 404 by construction', () => {
    for (const kind of PLAN_TARGETS) {
      const href = planTargetDef(kind).createHref?.(opts)
      if (!href) continue
      const segment = href.match(/^\/spaces\/([^/?]+)/)?.[1]
      if (segment) {
        expect(segment, `${kind} puts a UUID in the [slug] segment of ${href}`).toBe(opts.spaceSlug)
      }
    }
  })

  it('opens the Program on the page that exists, not the segment that has only a layout', () => {
    // The old href was /spaces/<id>/settings, where there is no page.tsx at all.
    const href = planTargetDef('program').createHref?.(opts)
    expect(href).toBe('/spaces/royal-temple/settings/program?plan=p')
    expect(existsSync(join(ROOT, 'app/(main)/spaces/[slug]/settings/program/page.tsx'))).toBe(true)
  })

  it('carries the Plan to the Program door, and the Program page reads it (PROG-CAL9)', () => {
    // PROG-CAL8 left this door WITHOUT the Plan on purpose: nothing on the page read one, and a
    // parameter nothing reads is the same class of lie as an href nothing serves. Both ends are
    // pinned here so neither can move without the other.
    const href = planTargetDef('program').createHref?.(opts) ?? ''
    expect(href).toMatch(/[?&]plan=p\b/)
    const page = readFileSync(join(ROOT, 'app/(main)/spaces/[slug]/settings/program/page.tsx'), 'utf8')
    expect(page).toMatch(/searchParams: Promise<\{[^}]*\bplan\?: string/)
    expect(page).toContain('getSpacePlan(space.id, planId)')
  })

  it('carries the Plan to every door that has somewhere to put it', () => {
    // The journey door has sent &plan= since 2026-09-19 to a page that did not declare it. Both
    // ends are pinned here so neither can move without the other.
    const journeyHref = planTargetDef('journey').createHref?.(opts) ?? ''
    expect(journeyHref).toContain('plan=p')
    const page = readFileSync(join(ROOT, 'app/(main)/journeys/new/page.tsx'), 'utf8')
    expect(page).toMatch(/searchParams: Promise<\{[^}]*\bplan\?: string/)
    // And the modal above it forwards searchParams verbatim, so its type must be just as wide or
    // the Production road loses the Plan on the one entry point that matters.
    const modal = readFileSync(join(ROOT, 'app/(main)/@wizard/(.)journeys/new/page.tsx'), 'utf8')
    expect(modal).toMatch(/searchParams: Promise<\{[^}]*\bplan\?: string/)
  })
})
