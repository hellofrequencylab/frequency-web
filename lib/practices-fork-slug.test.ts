import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// EVERY WRITE PATH INTO `practices` MINTS A SLUG.
//
// `createPractice` always did. `forkPractice` never did, and a seed migration
// (20260629000000_seed_season_1_stretch) did not either, so production ended up with public
// practices whose slug was NULL. `app/sitemap.ts` advertises `/discover/practices/${slug ?? id}`,
// so those rows shipped raw uuids to crawlers while every other practice shipped a keyword slug.
// The fallback is deliberate and stays; what was missing is anything that NOTICES it firing.
//
// Two guards now exist and they cover different layers:
//   • the DB trigger `practices_fill_slug` (migration 20260819141841) — the net. It cannot be
//     bypassed by any writer, including a future seed migration, but it produces an id-suffixed
//     slug rather than a clean short one.
//   • THIS TEST — the app path. It keeps the clean short slug the job of `uniquePracticeSlug()`,
//     so the net stays a net instead of quietly becoming the normal way slugs are made.
//
// Read statically rather than by executing the fork: the assertion is about the SHAPE of the
// insert payload, and a source read cannot be satisfied by a mock that happens to fill the field
// in. Same pattern as lib/page-editor/live-pricing.test.ts.

const SRC = readFileSync(new URL('./practices.ts', import.meta.url), 'utf8')

/** The body of a top-level `export async function <name>(` up to the next top-level `export`. */
function functionBody(name: string): string {
  const start = SRC.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found in lib/practices.ts`).toBeGreaterThan(-1)
  const rest = SRC.slice(start + 1)
  const end = rest.indexOf('\nexport ')
  return end === -1 ? rest : rest.slice(0, end)
}

describe('practice slugs are minted on every app write path', () => {
  it('forkPractice mints a slug into its insert payload', () => {
    const body = functionBody('forkPractice')
    expect(body).toContain('.insert(')
    expect(
      body,
      'forkPractice inserts a practice without a slug. A forked practice that is later made ' +
        'public reaches app/sitemap.ts as a raw uuid. Mint one with uniquePracticeSlug(src.title).',
    ).toContain('uniquePracticeSlug(')
  })

  it('createPractice still mints a slug', () => {
    expect(functionBody('createPractice')).toContain('uniquePracticeSlug(')
  })

  it('the slug helper is still the single minting point', () => {
    const definitions = SRC.match(/function uniquePracticeSlug\s*\(/g) ?? []
    expect(definitions, 'uniquePracticeSlug should be defined exactly once').toHaveLength(1)
  })
})
