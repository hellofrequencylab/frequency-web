import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { EVENT_HERO_COLUMNS } from '@/lib/events/hero-url'

// ── COVER PARITY: the share card must lead with the image the page leads with ────────────────────
//
// 🔴 THE REGRESSION THIS CLOSES, which shipped and was reported from an iMessage thread. An event's
// artwork can arrive from three places — a host-uploaded cover in the PUBLIC `event-media` bucket,
// or the scanner's full poster / cropped cover in the PRIVATE poster bucket — and the precedence
// across them was hand-rolled at three call sites. Two resolved all three. The third, the per-event
// OG share card, never selected `cover_image_path` at all and ordered the other two backwards. So
// every event whose host UPLOADED a cover — the common case — shared as the brand TEXT fallback
// card, while the page it linked to showed the artwork.
//
// ⚠️ WHY NOTHING CAUGHT IT. The card is correct-looking code that renders successfully: it asks for
// two columns, gets null for both, and takes its documented fallback branch. Every page rendered,
// every test passed, and the only symptom was a plain card on somebody else's phone. That is the
// exact shape of the staleness lib/og/root-card.test.ts was written for, one route over.
//
// So this measures the CONSEQUENCE, not the wording: each surface must SELECT every column the
// precedence reads (the omitted column IS the bug), and must resolve through the one authority
// rather than re-rolling the chain. Arm 3 is the net for a FOURTH surface nobody has written yet.

const ROOT = path.join(import.meta.dirname, '..')

/** Every surface that renders an event's own artwork as its lead image. */
const HERO_SURFACES = [
  // The event page hero. Walks `eventHeroCandidates` itself because it already holds batch-signed
  // poster URLs; the ORDER still comes from the shared authority.
  'app/(main)/events/[slug]/page.tsx',
  // The per-event social share / SEO card — the surface that broke.
  'app/(main)/events/[slug]/opengraph-image.tsx',
  // The seeded-event claim card.
  'app/events/claim/[token]/opengraph-image.tsx',
] as const

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Every string literal handed to a Supabase `.select(...)` in this source. */
export function selectStrings(src: string): string[] {
  return [...src.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1])
}

/** Does some select in this source name every column the hero precedence reads? */
export function selectsEveryHeroColumn(src: string): boolean {
  return selectStrings(src).some((sel) => {
    const cols = sel.split(',').map((c) => c.trim().split(/[\s(]/)[0])
    return EVENT_HERO_COLUMNS.every((want) => cols.includes(want))
  })
}

/** Files that name all three hero SOURCES are doing precedence by hand. */
function namesAllThreeTiers(src: string): boolean {
  return src.includes('cover_image_path') && src.includes('poster_path') && src.includes('coverPath')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('event hero parity', () => {
  it.each(HERO_SURFACES)('%s resolves the hero through the one authority', (rel) => {
    const src = read(rel)
    expect(src, `${rel} no longer imports lib/events/hero-url`).toMatch(
      /from '@\/lib\/events\/hero-url'/,
    )
    expect(
      /resolveEventHeroUrl|eventHeroCandidates/.test(src),
      `${rel} imports hero-url but calls neither hero API`,
    ).toBe(true)
  })

  it.each(HERO_SURFACES)('%s selects every column the precedence reads', (rel) => {
    // The shipped defect verbatim: a select that omits `cover_image_path` makes the authority
    // resolve a lower tier, or nothing, and the surface silently shows the wrong image.
    expect(selectsEveryHeroColumn(read(rel)), `${rel} omits one of ${EVENT_HERO_COLUMNS.join(', ')}`).toBe(
      true,
    )
  })

  it('is the only place the three-tier chain is spelled out', () => {
    // The net for a surface nobody has written yet: naming all three sources in one file means
    // re-rolling the precedence, which is how the three copies drifted in the first place.
    const offenders = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'components'))]
      .filter((f) => !f.endsWith(path.join('lib', 'events', 'hero-url.ts')))
      .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .filter((f) => namesAllThreeTiers(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders, 'resolve the hero through lib/events/hero-url.ts instead').toEqual([])
  })

  it('detects the omission it was written for (positive control)', () => {
    // Mutate the fixed source back into the shipped defect and watch the detector fire. A guard
    // nobody has seen go red is a guard nobody has tested.
    const fixed = read('app/(main)/events/[slug]/opengraph-image.tsx')
    expect(selectsEveryHeroColumn(fixed)).toBe(true)
    const broken = fixed.replace('cover_image_path, poster_path', 'poster_path')
    expect(broken, 'the mutation did not apply — re-anchor it').not.toBe(fixed)
    expect(selectsEveryHeroColumn(broken)).toBe(false)
  })
})
