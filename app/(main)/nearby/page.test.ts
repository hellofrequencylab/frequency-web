import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The EVENT half of this page's admin-client reads.
//
// The circle half is covered by the read-path ratchet in lib/circles/visibility.test.ts. Events had
// no equivalent guard anywhere, which is how the leak below survived: the queries filtered
// `is_cancelled` and `starts_at` and nothing else, under a comment asserting "events are
// anon-readable" — a claim that was never true of the table and that justified filtering nothing.
//
// MEASURED IN PRODUCTION 2026-08-12. `events` holds rows on three further axes:
//
//   | shape                              | rows |
//   |------------------------------------|------|
//   | published · public · not removed   |  51  |  ← the only listable one
//   | published · circle_only            |   2  |  🔴 scoped to one circle
//   | published · unlisted               |   1  |  🔴 direct link only
//   | published · public · REMOVED       |   1  |  🔴 taken down by a moderator
//
// All four of the bad rows happened to be in the past, so the upcoming window read clean and the
// hole was invisible. That is the reason this is a source assertion rather than a data assertion:
// a query is wrong the moment it is written, not the moment somebody schedules the row that
// exposes it.
const SRC = readFileSync(join(process.cwd(), 'app/(main)/nearby/page.tsx'), 'utf8')

describe('the Around You page filters events on every axis the table carries', () => {
  const REQUIRED: [fragment: string, why: string][] = [
    [`.eq('status', 'published')`, 'a draft event is not announced to the community'],
    [`.eq('visibility', 'public')`, 'circle_only and unlisted events are not discovery rows'],
    [`.is('removed_at', null)`, 'a moderator takedown stays taken down'],
  ]

  for (const [fragment, why] of REQUIRED) {
    it(`carries ${fragment} — ${why}`, () => {
      // Twice: the "Coming Up" list AND the count tile. A count that includes rows the list
      // excludes is its own small leak — it tells a stranger how much they are not being shown.
      const hits = SRC.split(fragment).length - 1
      expect(hits).toBeGreaterThanOrEqual(2)
    })
  }

  it('states that the admin client bypasses RLS, so the next reader knows why the filters are here', () => {
    // Deliberately NOT an assertion that the old "anon-readable" sentence is absent: this file's
    // own comment quotes that sentence to explain the bug, so such a check would fail on itself.
    // Doc-pin (scan2 L8-05): this pins a COMMENT in the source on purpose, as documentation, not behaviour.
    expect(SRC).toContain('bypasses RLS')
  })
})
