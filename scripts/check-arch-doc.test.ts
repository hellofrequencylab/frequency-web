import { describe, it, expect } from 'vitest'
import {
  runCheck,
  extractClaims,
  routeExists,
  trimTrailing,
  expandBraces,
  cronSection,
  floorViolation,
  ABSENT,
  MIN_DOC_BYTES,
  MIN_PATHS,
  MIN_CRONS,
  MIN_SCHEDULED,
} from './check-arch-doc.mjs'

// ── WHAT THESE TESTS ARE FOR ────────────────────────────────────────────────────────────────────
//
// This guard's dangerous failure is not a wrong answer, it is a VACUOUS one: a backtick scanner
// that stops matching, or a vercel.json that fails to parse, makes `drift: []` and the CLI prints
// a clean bill of health over a doc nobody checked. So the suite pins three things, in this order:
//
//   1. the live corpus is real and clears every floor (the guard is genuinely looking);
//   2. the floors FIRE when it is not (silence is reported as NOT ESTABLISHED, never as health);
//   3. the gate underneath actually catches drift — including, verbatim, the drift that was live
//      in this doc on 2026-08-17 and that no gate noticed for a month.
//
// (3) is the one that matters most. A guard written after the fact always passes on the tree it
// was written against; the only convincing evidence is that it fails on the HISTORICAL text.

/** The io seam. `read` serves both files the guard opens, so a test can vary either one. */
const io = (opts: {
  doc?: string
  vercel?: unknown
  exists?: (p: string) => boolean
  dirs?: (p: string) => string[]
  absent?: Record<string, string>
}) => ({
  read: (f: string) =>
    f.endsWith('vercel.json')
      ? JSON.stringify(opts.vercel ?? { crons: [] })
      : (opts.doc ?? ''),
  exists: opts.exists ?? (() => false),
  dirs: opts.dirs ?? (() => []),
  ...(opts.absent ? { absent: opts.absent } : {}),
})

describe('the live corpus is real', () => {
  const live = runCheck()

  it('reads a whole doc, not a truncated one', () => {
    expect(live.docBytes).toBeGreaterThanOrEqual(MIN_DOC_BYTES)
  })

  it('parses the real cron schedule out of vercel.json', () => {
    // Measured 27 on 2026-08-17. If this collapses, every cron name in the doc would be checked
    // against an empty schedule and would "pass" — the exact vacuity the floor exists to stop.
    expect(live.scheduled).toBeGreaterThanOrEqual(MIN_SCHEDULED)
  })

  it('extracts claims well past the floors', () => {
    // Measured 87 paths / 25 crons on 2026-08-17.
    expect(live.paths.length).toBeGreaterThanOrEqual(MIN_PATHS)
    expect(live.crons.length).toBeGreaterThanOrEqual(MIN_CRONS)
  })

  it('clears the floor and finds no drift', () => {
    expect(floorViolation(live)).toBeNull()
    expect(live.drift).toEqual([])
  })

  it('checks the crons the doc actually names, against the real schedule', () => {
    // Spot-check rather than freeze the list: these five span five of the six families the doc
    // groups jobs into, so a Cron section that silently stopped naming jobs fails here too.
    for (const job of ['process-queue', 'event-reminders', 'nurture', 'embed-events', 'billing-renewals']) {
      expect(live.crons).toContain(job)
    }
  })
})

describe('the cron COUNT in prose is checked, not trusted', () => {
  // The original drift said "19 Vercel Cron endpoints" while vercel.json scheduled 27. A number in
  // prose is the cheapest claim to write and the first one to rot, so it gets its own assertion.
  const doc = (n: number) => `## Cron\n\nThere are **${n} jobs as of 2026-08-17**.\n`
  const three = { crons: [1, 2, 3].map((i) => ({ path: `/api/cron/j${i}` })) }

  it('agrees when the number matches vercel.json', () => {
    const r = runCheck(io({ doc: doc(3), vercel: three, exists: () => true }))
    expect(r.claimedCount).toBe(3)
    expect(r.drift.filter((d: { kind: string }) => d.kind === 'count')).toEqual([])
  })

  it('fails when it does not — the exact shape of the 19-vs-27 drift', () => {
    const r = runCheck(io({ doc: doc(19), vercel: three, exists: () => true }))
    const d = r.drift.find((x: { kind: string }) => x.kind === 'count')
    expect(d?.claim).toBe('19 jobs')
    expect(d?.why).toMatch(/vercel\.json schedules 3/)
  })

  it('fails when the doc states no count at all, rather than passing by omission', () => {
    const r = runCheck(io({ doc: '## Cron\n\nSome jobs run.\n', vercel: three }))
    expect(r.claimedCount).toBeNull()
    expect(r.drift.find((x: { kind: string }) => x.kind === 'count')?.why).toMatch(/states no/)
  })

  it('the live doc states a count and it is right', () => {
    const live = runCheck()
    expect(live.claimedCount).toBe(live.scheduled)
  })
})

describe('the floors fire on a corpus that is not real', () => {
  it('an unreadable doc is NOT ESTABLISHED, not a pass', () => {
    const r = runCheck(io({ doc: '' }))
    // The path/route/cron passes report NOTHING on an empty doc — exactly the vacuous "clean"
    // the floor exists to catch. (The count check does fire, because a doc with no count is a
    // failure by itself; it is the only one of the four that cannot be silenced by an empty read.)
    expect(r.drift.filter((d: { kind: string }) => d.kind !== 'count')).toEqual([])
    expect(floorViolation(r)).toMatch(/NOT ESTABLISHED/)
    expect(floorViolation(r)).toMatch(/read only 0 bytes/)
  })

  it('an unparseable vercel.json is NOT ESTABLISHED, even with a full doc', () => {
    // The sneakiest one: the doc is fine, every cron claim is extracted, and each is compared
    // against an EMPTY schedule. Without this floor, `scheduled: []` would report every cron as
    // drift — or, if the comparison were inverted, report health. Either way the run means nothing.
    const r = runCheck({ ...io({ doc: 'x'.repeat(MIN_DOC_BYTES + 1) }), read: (f: string) =>
      f.endsWith('vercel.json') ? 'not json{' : 'x'.repeat(MIN_DOC_BYTES + 1) })
    expect(r.scheduled).toBe(0)
    expect(floorViolation(r)).toMatch(/parsed only 0 cron\(s\)/)
  })

  it('a long doc with no backticks at all is NOT ESTABLISHED', () => {
    const r = runCheck(io({ doc: 'prose '.repeat(4000), vercel: { crons: Array(30).fill({ path: '/api/cron/x' }) } }))
    expect(r.paths).toEqual([])
    expect(floorViolation(r)).toMatch(/extracted only 0 path claim/)
  })

  it('always says the silence means nothing rather than reporting health', () => {
    expect(floorViolation({ docBytes: 0, scheduled: 0, paths: [], crons: [] })).toMatch(/means nothing/)
  })

  it('a corpus exactly at the floors passes them', () => {
    expect(
      floorViolation({
        docBytes: MIN_DOC_BYTES,
        scheduled: MIN_SCHEDULED,
        paths: Array(MIN_PATHS).fill('x'),
        crons: Array(MIN_CRONS).fill('x'),
      }),
    ).toBeNull()
  })
})

// ── THE HISTORICAL PROOF ────────────────────────────────────────────────────────────────────────
//
// Verbatim excerpts of docs/ARCHITECTURE.md as it stood before HYG-004, reproduced here so the
// evidence cannot evaporate when the doc is edited again. `absent: {}` empties the negative-claim
// set, because in the old text these were POSITIVE claims: the doc said the jobs were live.
describe('it fails on the drift that was actually live on 2026-08-17', () => {
  const OLD_CRON = `## Cron

Endpoints under \`app/api/cron/\`, scheduled in \`vercel.json\`. The originals:
\`event-reminders\` (*/15m), \`lifecycle-triggers\` (daily), \`weekly-digest\`
(Sun 14:00), \`event-occurrences\` (daily 02:00), \`publish-scheduled\`, and
\`process-queue\` (*/2m). Later additions ride the same pattern, notably the
Rewards Economy v2 pair (ADR-219): \`coop-pulse\` (daily 00:50 UTC) and
\`practice-streaks\` (daily 01:10 UTC).

## Next section
`
  const OLD_TABLE = '| `supabase/{server,admin,client,public}.ts` | Supabase clients |'

  const realSchedule = { crons: runCheck().crons.map((c: string) => ({ path: `/api/cron/${c}` })) }

  it('names both deleted Rewards Economy v2 crons', () => {
    const r = runCheck(
      io({
        doc: OLD_CRON,
        vercel: realSchedule,
        exists: (p: string) => p.startsWith('app/api/cron/') && !/(coop-pulse|practice-streaks)/.test(p),
        absent: {},
      }),
    )
    const named = r.drift.filter((d: { kind: string }) => d.kind === 'cron').map((d: { claim: string }) => d.claim)
    expect(named).toContain('coop-pulse')
    expect(named).toContain('practice-streaks')
    // …and does not cry wolf over the six that are still scheduled.
    expect(named).not.toContain('process-queue')
    expect(named).not.toContain('weekly-digest')
  })

  it('expands the brace set and catches the four paths that were missing the lib/ prefix', () => {
    const r = runCheck(io({ doc: OLD_TABLE, vercel: realSchedule, exists: () => false, absent: {} }))
    expect(r.paths).toEqual([
      'supabase/admin.ts',
      'supabase/client.ts',
      'supabase/public.ts',
      'supabase/server.ts',
    ])
    expect(r.drift.map((d: { claim: string }) => d.claim)).toContain('supabase/server.ts')
  })
})

describe('a negative claim is an assertion in the other direction', () => {
  it('the doc says middleware.ts must not exist; a tree that has one FAILS', () => {
    const r = runCheck(io({ doc: 'x'.repeat(MIN_DOC_BYTES), exists: (p: string) => p === 'middleware.ts' }))
    const d = r.drift.find((x: { kind: string }) => x.kind === 'absent')
    expect(d?.claim).toBe('middleware.ts')
    expect(d?.why).toMatch(/does NOT exist, but it does/)
  })

  it('a resurrected coop-pulse cron fails rather than silently agreeing with the doc', () => {
    const r = runCheck(
      io({ doc: 'x', vercel: { crons: [{ path: '/api/cron/coop-pulse' }] }, exists: () => false }),
    )
    expect(r.drift.map((x: { claim: string }) => x.claim)).toContain('coop-pulse')
  })

  it('every ABSENT entry carries a reason, so no entry is a bare waiver', () => {
    for (const [claim, reason] of Object.entries(ABSENT)) {
      expect(reason.length, `${claim} needs a reason`).toBeGreaterThan(20)
    }
  })
})

describe('the extractors', () => {
  it('keeps a route group’s own paren but drops sentence punctuation', () => {
    expect(trimTrailing('app/(main)')).toBe('app/(main)')
    expect(trimTrailing('lib/auth.ts,')).toBe('lib/auth.ts')
    expect(trimTrailing('lib/site.ts).')).toBe('lib/site.ts')
  })

  it('expands nested brace sets', () => {
    expect(expandBraces('lib/supabase/{a,b}.ts')).toEqual(['lib/supabase/a.ts', 'lib/supabase/b.ts'])
    expect(expandBraces('lib/x.ts')).toEqual(['lib/x.ts'])
  })

  it('ignores fenced code, where shell commands live', () => {
    const doc = '`lib/real.ts`\n```\n`lib/fenced.ts`\npnpm dev\n```\n'
    const { paths } = extractClaims(doc, {})
    expect(paths).toEqual(['lib/real.ts'])
  })

  it('reads a slug as a cron ONLY inside the Cron section', () => {
    const doc = '`daily-digest` in prose.\n\n## Cron\n\n`real-job` here.\n\n## After\n\n`other-job`\n'
    expect(cronSection(doc).trim()).toBe('`real-job` here.')
    expect(extractClaims(doc, {}).crons).toEqual(['real-job'])
  })

  it('does not mistake an identifier, an env var or a token name for a claim', () => {
    const doc = '`shouldSend(a, b)` `CRON_SECRET` `bg-surface` `--color-canvas` `@theme inline`'
    const c = extractClaims(doc, {})
    expect(c.paths).toEqual([])
    expect(c.routes).toEqual([])
  })
})

describe('route resolution sees through groups but NOT through catch-alls', () => {
  // A virtual app/ tree: /sign-in sits under a (main) group; /people/[handle] is dynamic.
  // A plain existsSync would resolve neither, because `(main)` is not part of any URL.
  const tree: Record<string, string[]> = {
    app: ['(main)', '(marketing)'],
    'app/(main)': ['sign-in', 'people'],
    'app/(main)/people': ['[handle]'],
    'app/(marketing)': ['[slug]'],
  }
  const files = new Set([
    'app/(main)/sign-in/page.tsx',
    'app/(main)/people/[handle]/page.tsx',
    'app/(marketing)/[slug]/page.tsx',
  ])
  const r = { dirs: (p: string) => tree[p] ?? [], exists: (p: string) => files.has(p) }

  it('sees through a route group to a literal page', () => {
    expect(routeExists('/sign-in', r)).toBe(true)
  })

  it('resolves a dynamic route when the CLAIM is written as one', () => {
    expect(routeExists('/people/[handle]', r)).toBe(true)
  })

  it('rejects a route with no handler', () => {
    expect(routeExists('/people/ada/edit', r)).toBe(false)
  })

  // ── The correction that matters ───────────────────────────────────────────────────────────
  // `app/(marketing)/[slug]` is a catch-all, so under router semantics EVERY one-segment URL
  // "exists". The first version of this guard used those semantics and therefore called
  // `/ghost-route` a real route — a check that cannot fail. Literal-by-default is what makes
  // the route pass able to report anything at all.
  it('does NOT let a catch-all validate an invented route', () => {
    expect(routeExists('/ghost-route', r)).toBe(false)
    expect(routeExists('/ghost-route', r, { dynamic: true })).toBe(true) // the old, useless answer
  })

  it('rejects a route that was deleted from the tree', () => {
    // `/broadcast` is the real example: the doc's directory map listed it long after
    // app/(main)/broadcast was removed and broadcasting became a per-surface capability.
    expect(routeExists('/broadcast', r)).toBe(false)
  })
})
