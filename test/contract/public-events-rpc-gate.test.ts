import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ADR-903 — the two anon discover event RPCs, and the one place their gates must DIVERGE.
//
// `public_events` (the /discover listings + the marketing splash strips) and `public_event_by_slug`
// (the /discover/events/<slug> twin) are both `security definer` and both granted to `anon`, so RLS
// on `events` does NOT run inside them. As shipped in 20260612020000 they gated `is_cancelled` and
// nothing else — no visibility gate at all — so `circle_only` and `private` events were served to
// anonymous callers.
//
// These assertions pin the narrowed gate as SQL text, with no live database, in four parts:
//   (A) both are still real DEFINER functions with a pinned search_path and an anon grant;
//   (B) the four shared gates are present ONCE PER FUNCTION, and the no-visibility-gate state is
//       impossible to return to;
//   (C) 🔴 the DELIBERATE ASYMMETRY. A listing is public-only; a link resolver honours the link
//       (ADR-202). Collapsing the two — in either direction — is the failure mode this file exists
//       for. Widening the listing to admit unlisted re-opens the crawl leak ADR-899 closed on the
//       organizer RPCs; narrowing the resolver to 'public' alone 404s /discover/events/<slug> for an
//       unlisted event while /events/<slug>, the URL it canonicalises to, keeps rendering.
//   (D) 🔴 the JOIN SHAPE. Unlike ADR-899's organizer RPC, `events` is the DRIVING table here, so
//       the new predicates belong in the outer WHERE and an `e.` predicate parked in the circles ON
//       clause would filter nothing at all. What must not change is the join being LEFT: an inner
//       join erases every standalone (non-circle) event (ADR-254).
//
// Archetype: test/contract/public-organizer-rpc-gate.test.ts (ADR-899), whose definitionBlock() and
// bodyBlock() helpers are reused verbatim.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20270124000000_public_events_narrow.sql'),
  'utf8',
)

/** The function DEFINITION block only — from `create ... function public.<fn>(` to the `as $$` body
 *  marker — so the SECURITY DEFINER / search_path assertions match the real CLAUSE, never a comment
 *  that merely mentions "security definer" elsewhere in the migration. */
function definitionBlock(sql: string, fn: string): string {
  const lower = sql.toLowerCase()
  const start = lower.indexOf(`function public.${fn}(`)
  if (start === -1) return ''
  const body = lower.indexOf('as $$', start)
  return lower.slice(start, body === -1 ? undefined : body)
}

/** The executable BODY of one function — between its `as $$` and the closing `$$;`. */
function bodyBlock(sql: string, fn: string): string {
  const lower = sql.toLowerCase()
  const start = lower.indexOf(`function public.${fn}(`)
  if (start === -1) return ''
  const open = lower.indexOf('as $$', start)
  const close = lower.indexOf('$$;', open + 5)
  return lower.slice(open + 5, close === -1 ? undefined : close)
}

const FUNCTIONS = ['public_events', 'public_event_by_slug'] as const

describe('(A) ADR-903: both discover event RPCs stay DEFINER, path-pinned and anon-granted', () => {
  for (const fn of FUNCTIONS) {
    it(`${fn} is redefined SECURITY DEFINER with a pinned search_path`, () => {
      const def = definitionBlock(SQL, fn)
      expect(def, `${fn} definition not found in the migration`).not.toBe('')
      expect(def, `${fn} must be SECURITY DEFINER`).toMatch(/\bsecurity definer\b/)
      expect(def, `${fn} must pin search_path`).toMatch(/set search_path\s*=\s*public/)
      expect(def, `${fn} must not be SECURITY INVOKER`).not.toContain('security invoker')
    })
  }

  it('the anon grant is re-issued for both, so a fresh replay is self-contained', () => {
    expect(SQL).toContain('grant execute on function public.public_events(integer) to anon, authenticated;')
    expect(SQL).toContain('grant execute on function public.public_event_by_slug(text) to anon, authenticated;')
  })

  it('uses CREATE OR REPLACE, never DROP — the OUT columns are unchanged, so no 42P13 and no lost grant', () => {
    expect(SQL.match(/create or replace function public\.public_event/g)?.length).toBe(2)
    expect(SQL).not.toMatch(/^\s*drop function/im)
  })

  it('keeps all ten OUT columns, in order, on both functions', () => {
    // lib/database.types.ts is generated from these names. A reorder or rename is a 42P13 on deploy
    // and a silent column swap in lib/discover.ts's cast if it somehow lands.
    const COLUMNS = [
      'id          uuid',
      'slug        text',
      'title       text',
      'description text',
      'starts_at   timestamptz',
      'ends_at     timestamptz',
      'city        text',
      'circle_id   uuid',
      'circle_name text',
      'price_cents integer',
    ]
    for (const col of COLUMNS) {
      expect(SQL.split(col).length - 1, `${col} must appear in both RETURNS TABLE blocks`).toBe(2)
    }
  })
})

describe('(B) ADR-903: every shared gate is present once per function', () => {
  // Each predicate appears exactly twice in the migration: once in each function body. These four
  // are identical on both surfaces — only `visibility` is allowed to differ (see block C).
  // Counted inside each BODY, never across the whole file: the migration's header prose quotes
  // several of these predicates while explaining them, and a guard that a comment can satisfy is
  // not a guard.
  const GATES: [string, string][] = [
    ['published only (a draft is owner-private)', "coalesce(e.status, 'published') = 'published'"],
    ['staff removal reaches the anon surface', 'e.removed_at is null'],
    ['no demo events on a discovery read', 'e.is_demo = false'],
    ['the Space wall is re-applied (network)', "s.visibility = 'network'"],
    ['the Space wall is re-applied (active)', "s.status = 'active'"],
    ['cancelled events stay excluded', 'e.is_cancelled = false'],
  ]

  for (const [label, gate] of GATES) {
    it(`carries the gate in BOTH functions: ${label}`, () => {
      for (const fn of FUNCTIONS) {
        expect(bodyBlock(SQL, fn).split(gate).length - 1, `${fn} must carry: ${gate}`).toBe(1)
      }
    })
  }

  it('the Space wall is a correlated EXISTS, and platform events still pass', () => {
    for (const fn of FUNCTIONS) {
      const body = bodyBlock(SQL, fn)
      expect(body).toContain('exists (select 1 from public.spaces s')
      expect(body, 'platform events (no Space) must still pass').toContain('e.space_id is null')
    }
  })

  it('NEVER returns to the ungated state: neither body can lack a visibility predicate', () => {
    for (const fn of FUNCTIONS) {
      expect(bodyBlock(SQL, fn), `${fn} must carry a visibility gate`).toMatch(/e\.visibility\s*(=|in)/)
    }
  })

  it('the upcoming floor is on the LISTING only — a past event page must still resolve', () => {
    expect(bodyBlock(SQL, 'public_events')).toContain('e.starts_at >= now()')
    expect(bodyBlock(SQL, 'public_event_by_slug')).not.toContain('starts_at >= now()')
  })
})

describe('(C) ADR-903: the listing is public-only, the link resolver honours the link', () => {
  // 🔴 The judgment this ADR exists to record. Collapsing these two gates into one is wrong in BOTH
  // directions, and neither direction announces itself in a diff.
  /** Every `e.visibility ...` PREDICATE in a body, comments stripped, so a gate is never confused
   *  with the comment that explains it. */
  function visibilityPredicates(fn: string): string[] {
    return bodyBlock(SQL, fn)
      .split('\n')
      .map((l) => l.replace(/--.*$/, '').trim())
      .filter((l) => l.includes('e.visibility'))
  }

  it('public_events admits PUBLIC ONLY — unlisted is a link, not a listing (ADR-202)', () => {
    const gates = visibilityPredicates('public_events')
    expect(gates.length, 'exactly one visibility gate on the listing').toBe(1)
    expect(gates[0]).toContain("e.visibility = 'public'")
    expect(gates[0], 'a crawlable listing must never admit unlisted').not.toContain('unlisted')
  })

  it('public_event_by_slug admits PUBLIC AND UNLISTED — the slug IS the link', () => {
    const gates = visibilityPredicates('public_event_by_slug')
    expect(gates.length, 'exactly one visibility gate on the resolver').toBe(1)
    expect(gates[0]).toMatch(/e\.visibility in \('public', 'unlisted'\)/)
    // Narrowing this one to 'public' alone would 404 the discover twin while the canonical
    // /events/<slug> page it points at kept rendering.
    expect(gates[0]).not.toMatch(/e\.visibility\s*=\s*'public'/)
  })

  it('NEITHER function admits circle_only or private, in any form', () => {
    for (const fn of FUNCTIONS) {
      for (const gate of visibilityPredicates(fn)) {
        expect(gate, `${fn} must never admit circle_only`).not.toContain('circle_only')
        expect(gate, `${fn} must never admit private`).not.toContain('private')
      }
    }
  })
})

describe('(D) ADR-903: the join shape is preserved and the predicates sit where they filter', () => {
  // 🔴 Inverted from ADR-899. There the driving table was `profiles` and the event predicates had to
  // hide in the ON clause so the host row survived. Here `events` IS the driving table: a predicate
  // on `e` inside the circles ON clause filters NOTHING — it only blanks the circle columns — which
  // would ship a security fix that does not secure anything.
  for (const fn of FUNCTIONS) {
    it(`${fn} drives off events and LEFT JOINs circles (standalone events must survive, ADR-254)`, () => {
      const body = bodyBlock(SQL, fn)
      expect(body).toContain('from   public.events e')
      expect(body).toContain('left join public.circles c')
      expect(body).toMatch(/on e\.scope_type = 'circle' and e\.scope_id = c\.id/)
      expect(body, 'an inner join here erases every standalone event').not.toMatch(/\n\s*join public\.circles/)
    })

    it(`${fn} keeps every new event predicate in the outer WHERE, where it actually filters`, () => {
      const body = bodyBlock(SQL, fn)
      const whereAt = body.indexOf('where ')
      expect(whereAt, 'outer WHERE not found — the guard cannot anchor').toBeGreaterThan(0)
      for (const gate of [
        "coalesce(e.status, 'published') = 'published'",
        'e.removed_at is null',
        'e.visibility',
        'e.is_demo = false',
        'e.space_id is null',
      ]) {
        const at = body.indexOf(gate)
        expect(at, `${gate} missing from ${fn}`).toBeGreaterThan(-1)
        expect(at, `${gate} must live in the outer WHERE, not the circles ON clause`).toBeGreaterThan(
          whereAt,
        )
      }
    })
  }
})

describe('(E) ADR-903: the callers document the narrowed contract (docs move with the SQL)', () => {
  it('lib/discover.ts no longer describes the RPCs as location-redaction only', () => {
    const discover = readFileSync(join(ROOT, 'lib/discover.ts'), 'utf8')
    expect(discover).toContain('ADR-903')
  })

  it('app/sitemap.ts no longer claims the RPC "filters only is_cancelled + starts_at"', () => {
    const sitemap = readFileSync(join(ROOT, 'app/sitemap.ts'), 'utf8')
    expect(sitemap).not.toContain('it filters only')
    expect(sitemap).toContain('ADR-903')
  })

  it('lib/events/series-seo.ts records that the gap it routed around is closed', () => {
    const seo = readFileSync(join(ROOT, 'lib/events/series-seo.ts'), 'utf8')
    // The reader still does NOT use the RPC (it needs columns the RPC never projected), so the
    // header must keep naming it — series-seo.test.ts asserts that too.
    expect(seo).toContain('public_events')
    expect(seo).toContain('ADR-903')
  })
})
