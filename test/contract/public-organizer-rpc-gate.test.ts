import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ADR-899 — the two anon organizer RPCs are the gate on a CRAWLABLE surface.
//
// `public_organizer_events` (the organizer page) and `public_organizer_handles` (the sitemap) are
// both `security definer` and both granted to `anon`, so RLS on `events` does NOT run inside them.
// The predicates in their bodies are 100% of the gate on a page that is self-canonical, submitted to
// search engines, and emits Person + Event JSON-LD. When they shipped in 20260613120000 they gated
// only `is_cancelled` + `visibility`, which let DRAFT, staff-REMOVED and link-only UNLISTED events —
// and public events tenanted to a walled Space — reach anonymous crawlers.
//
// These assertions pin the narrowed gate as SQL text, with no live database, in three parts:
//   (A) both functions are still real DEFINER functions with a pinned search_path and an anon grant;
//   (B) every gate is present ONCE PER FUNCTION, and the widening it replaced is present ZERO times;
//   (C) 🔴 the ON-clause survival property. `public_organizer_events` is `profiles LEFT JOIN events`,
//       and the page depends on the host-only row: an empty row set is a 404. Move one event
//       predicate into the outer WHERE and the LEFT JOIN silently becomes an INNER JOIN, 404-ing
//       every host with no public events. No reviewer catches that by eye; a string-index comparison
//       against the outer `where` does.
//
// Archetype: the ADR-898 block in lib/events/store.test.ts and the definitionBlock() helper in
// test/contract/security-definer-gate.test.ts.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20270123000000_public_organizer_events_narrow.sql'),
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

const FUNCTIONS = ['public_organizer_events', 'public_organizer_handles'] as const

describe('(A) ADR-899: both organizer RPCs stay DEFINER, path-pinned and anon-granted', () => {
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
    expect(SQL).toContain('grant execute on function public.public_organizer_events(text) to anon, authenticated;')
    expect(SQL).toContain(
      'grant execute on function public.public_organizer_handles(integer) to anon, authenticated;',
    )
  })

  it('uses CREATE OR REPLACE, never DROP — the OUT columns are unchanged, so no 42P13 and no lost grant', () => {
    expect(SQL.match(/create or replace function public\.public_organizer_/g)?.length).toBe(2)
    expect(SQL).not.toMatch(/^\s*drop function/im)
  })
})

describe('(B) ADR-899: every gate is present once per function, and the widening is gone', () => {
  // Each predicate appears exactly twice in the migration: once in each function body. If a future
  // edit drops one from either side, the page and the sitemap disagree and the sitemap starts
  // advertising URLs that render their empty state (soft-404s).
  const GATES: [string, RegExp][] = [
    ['published only (a draft is owner-private)', /coalesce\(e\.status, 'published'\) = 'published'/g],
    ['staff removal reaches the indexed surface', /e\.removed_at is null/g],
    ['PUBLIC only — unlisted is a link, not a listing', /e\.visibility = 'public'/g],
    ['no demo events in a search index', /e\.is_demo = false/g],
    ['no demo hosts in a search index', /p\.is_demo = false/g],
    ['the Space wall is re-applied (network)', /s\.visibility = 'network'/g],
    ['the Space wall is re-applied (active)', /s\.status = 'active'/g],
    ['cancelled events stay excluded', /e\.is_cancelled = false/g],
  ]

  for (const [label, re] of GATES) {
    it(`carries the gate in BOTH functions: ${label}`, () => {
      expect(SQL.match(re)?.length ?? 0).toBe(2)
    })
  }

  it('NEVER widens back: the unlisted-admitting predicate appears zero times', () => {
    // The non-negotiable half. `visibility in ('public', 'unlisted')` is the exact string this
    // migration removed; if it returns in any form, the crawl leak is back.
    expect(SQL).not.toMatch(/visibility in \(\s*'public'\s*,\s*'unlisted'\s*\)/)
    expect(SQL.toLowerCase()).not.toMatch(/e\.visibility\s*=\s*'unlisted'/)
  })

  it('the Space wall is expressed as a correlated EXISTS, so the query shape is untouched', () => {
    expect(SQL.match(/exists \(select 1 from public\.spaces s/g)?.length).toBe(2)
    // Platform events (no Space) must still pass — the wall gates tenanted rows only.
    expect(SQL.match(/e\.space_id is null/g)?.length).toBe(2)
  })
})

describe('(C) ADR-899: every event predicate survives in the LEFT JOIN ON clause', () => {
  // 🔴 The property no eyeball catches. `public_organizer_events` is `profiles p LEFT JOIN events e`,
  // and app/discover/events/organizer/[handle]/page.tsx returns null → notFound() when the row set is
  // empty, relying on the HOST-ONLY row (all event columns NULL) to render "nothing on the public
  // calendar right now". A predicate on `e` moved into the outer WHERE converts the LEFT JOIN into an
  // INNER JOIN, so a host with nothing public 404s instead of showing their empty state — a security
  // narrowing turning into an availability regression.
  const body = bodyBlock(SQL, 'public_organizer_events')

  it('the body is a LEFT JOIN onto events with the host-preserving outer WHERE', () => {
    expect(body).toContain('from   public.profiles p')
    expect(body).toContain('left join public.events e')
    expect(body).toContain('where  p.handle = _handle')
  })

  it('each event gate sits BEFORE the outer WHERE (i.e. inside the ON clause)', () => {
    const whereAt = body.indexOf('where  p.handle = _handle')
    expect(whereAt, 'outer WHERE not found — the guard cannot anchor').toBeGreaterThan(0)
    for (const gate of [
      "coalesce(e.status, 'published') = 'published'",
      'e.removed_at is null',
      "e.visibility = 'public'",
      'e.is_demo = false',
      'e.is_cancelled = false',
      'e.space_id is null',
    ]) {
      const at = body.indexOf(gate)
      expect(at, `${gate} missing from public_organizer_events`).toBeGreaterThan(-1)
      expect(at, `${gate} must stay in the ON clause, not the outer WHERE`).toBeLessThan(whereAt)
    }
  })

  it('only the HOST predicates live in the outer WHERE (they may, and must, filter the host row)', () => {
    const whereAt = body.indexOf('where  p.handle = _handle')
    // p.is_demo gates the host itself: a demo profile must yield zero rows so the page notFound()s
    // rather than emitting Person JSON-LD for someone who does not exist.
    expect(body.indexOf('p.is_demo = false')).toBeGreaterThan(whereAt)
  })
})

describe('(D) ADR-899: the callers document the narrowed contract (docs move with the SQL)', () => {
  it('the organizer page no longer advertises "public/unlisted"', () => {
    const page = readFileSync(
      join(ROOT, 'app/discover/events/organizer/[handle]/page.tsx'),
      'utf8',
    )
    expect(page).not.toContain('public/unlisted')
    // Doc-pin (scan2 L8-05): this pins a COMMENT in the source on purpose, as documentation, not behaviour.
    expect(page).toContain('ADR-899')
  })

  it('the sitemap no longer advertises "public/unlisted"', () => {
    const sitemap = readFileSync(join(ROOT, 'app/sitemap.ts'), 'utf8')
    expect(sitemap).not.toContain('public/unlisted')
    // Doc-pin (scan2 L8-05): this pins a COMMENT in the source on purpose, as documentation, not behaviour.
    expect(sitemap).toContain('ADR-899')
  })

  it('lib/people/associations.ts no longer claims the RPC "filters only is_cancelled + visibility"', () => {
    const assoc = readFileSync(join(ROOT, 'lib/people/associations.ts'), 'utf8')
    expect(assoc).not.toContain('that RPC filters only')
    // Doc-pin (scan2 L8-05): this pins a COMMENT in the source on purpose, as documentation, not behaviour.
    expect(assoc).toContain('ADR-899')
  })
})
