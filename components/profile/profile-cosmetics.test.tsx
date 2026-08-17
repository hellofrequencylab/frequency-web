import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BORDER_RENDERS,
  FLAIR_RENDERS,
  MAX_TITLE_LENGTH,
  type BorderRender,
} from '@/lib/store/cosmetics'
import { CosmeticBorder, CosmeticFlair, CosmeticTitle } from './profile-cosmetics'

// THE PAINT GATE (backlog LIVE-013) — the half `check:cosmetic-renders` cannot see.
//
// ── WHY THIS EXISTS, AND WHY THE EXISTING GUARD IS NOT ENOUGH ─────────────────────────────────
//
// `scripts/check-cosmetic-renders.mjs` asks one question: does a purchasable SKU resolve to a key
// in the render REGISTRY (`lib/store/cosmetics.ts`)? That closed the hole where the shelf sold a
// value no registry row named. It leaves TWO holes open behind it, and both re-create the exact
// defect LIVE-013 is about — a member paying Gems for something that renders nowhere:
//
//   1. A REGISTRY ROW THAT DOES NOT PAINT. `CosmeticFlair` resolves its icon through a lookup
//      (`FLAIR_ICONS`) that lives in the component, not the registry, and returns `null` when the
//      key is absent. So adding `{ shield: { icon: 'shield', … } }` to `FLAIR_RENDERS` makes the
//      store CHARGE for it (the guard goes green: the registry resolves it) while the profile
//      paints nothing at all. `kind: 'paint'` borders have the quieter twin: a painted border with
//      no `SWEEP` entry silently falls back to Prismatic's sweep, so the member gets somebody
//      else's art. Neither is hypothetical — both are one object literal away, and today's five
//      flairs and two sweeps line up only because one person kept two lists in their head.
//
//   2. A REGISTRY THAT NOTHING READS. The whole 950-Gem defect was three columns on `profiles`
//      whose only reader was a text chip in the buyer's own Vault. The fix is the WIRING on the
//      public profile (`app/(main)/people/[handle]/page.tsx`) — and deleting that wiring restores
//      the defect in full while every gate in the repo stays green, because the registry, the
//      components and the shelf census are all still perfectly intact.
//
// So this file measures the CONSEQUENCE the guard skips: every value the store may charge for
// paints something a person can see, and the public profile is the thing painting it.
//
// Pure `renderToStaticMarkup`, no providers — same harness as lib/page-editor/block-render.test.tsx.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The wiring detector, as a pure function so the mutation fixtures at the foot of this file can
// drive the SAME code the real assertion drives. A detector proven only against the source it
// passes on is a detector nobody has seen fire.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The three cosmetic slots, each as (column on `profiles`, the component that paints it). */
export const COSMETIC_WIRING: readonly { column: string; component: string }[] = [
  { column: 'profile_border', component: 'CosmeticBorder' },
  { column: 'profile_flair', component: 'CosmeticFlair' },
  { column: 'custom_title', component: 'CosmeticTitle' },
]

/**
 * Problems with a surface's cosmetic wiring (empty = wired).
 *
 * The assertion is a CHAIN, not three independent greps: the column must be read into a binding,
 * and THAT binding must be the one handed to the component. Checking only that both strings occur
 * would pass a page that selects the column and paints an unrelated variable — which is precisely
 * the "shape, not truth" failure this repo names in four ADRs.
 */
export function wiringProblems(source: string): string[] {
  const problems: string[] = []
  for (const { column, component } of COSMETIC_WIRING) {
    const bound = new RegExp(`\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=[^\\n]*\\b${column}\\b`).exec(source)
    if (!bound) {
      problems.push(`${column} is not read into any binding — nothing on this surface can paint it`)
      continue
    }
    const binding = bound[1]
    const painted = new RegExp(`<${component}\\s[^>]*value=\\{\\s*${binding}\\s*[}\\s]`).test(source)
    if (!painted) {
      problems.push(`<${component} value={${binding}}> is missing — ${column} is read and then dropped`)
    }
  }
  return problems
}

const PROFILE_PAGE = 'app/(main)/people/[handle]/page.tsx'
const profileSource = readFileSync(PROFILE_PAGE, 'utf8')

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('the vocabulary is real, so nothing below passes vacuously', () => {
  it('the registry declares a non-trivial set of borders and flairs', () => {
    // Floors, not exact counts: an emptied registry would make every `for…of` below iterate zero
    // times and report a clean run over nothing (ADR-962). Measured 2026-08-17: 6 borders, 5 flairs.
    expect(Object.keys(BORDER_RENDERS).length).toBeGreaterThanOrEqual(5)
    expect(Object.keys(FLAIR_RENDERS).length).toBeGreaterThanOrEqual(5)
  })
})

describe('THE INVARIANT — every value the store may charge for actually paints', () => {
  it('every border in the registry renders something the bare avatar does not have', () => {
    const bare = renderToStaticMarkup(<i data-avatar />)
    for (const [value, render] of Object.entries(BORDER_RENDERS) as [string, BorderRender][]) {
      const html = renderToStaticMarkup(
        <CosmeticBorder value={value}>
          <i data-avatar />
        </CosmeticBorder>,
      )
      expect(html, `border "${value}" renders the avatar unchanged`).not.toBe(bare)
      expect(html, `border "${value}" does not name itself`).toContain(render.label)
    }
  })

  it('a `ring` border emits its ring class, so the halo is a real utility and not a title tooltip', () => {
    for (const [value, render] of Object.entries(BORDER_RENDERS) as [string, BorderRender][]) {
      if (render.kind !== 'ring') continue
      const html = renderToStaticMarkup(
        <CosmeticBorder value={value}>
          <i />
        </CosmeticBorder>,
      )
      expect(html, `border "${value}" is missing ${render.ring}`).toContain(render.ring)
    }
  })

  it('a `paint` border has its OWN sweep — no painted border may fall back to another one\'s art', () => {
    // The component reaches into a SWEEP map keyed by the stored value and falls back to the
    // Prismatic sweep when the key is absent. A new painted border with no SWEEP entry would
    // therefore render, pass the shelf guard, and hand the member the 2,500-Gem cosmetic's art.
    // Compare against a value that is deliberately NOT in SWEEP to get the fallback's markup.
    const fallback = sweepOf(
      renderToStaticMarkup(
        <CosmeticBorder value="gradient">
          <i />
        </CosmeticBorder>,
      ),
    )
    expect(fallback, 'the painted control produced no background-image').toBeTruthy()

    const seen = new Map<string, string>()
    for (const [value, render] of Object.entries(BORDER_RENDERS) as [string, BorderRender][]) {
      if (render.kind !== 'paint') continue
      const sweep = sweepOf(
        renderToStaticMarkup(
          <CosmeticBorder value={value}>
            <i />
          </CosmeticBorder>,
        ),
      )
      expect(sweep, `painted border "${value}" draws no sweep at all`).toBeTruthy()
      const twin = [...seen.entries()].find(([, s]) => s === sweep)
      expect(
        twin,
        `painted border "${value}" draws the same sweep as "${twin?.[0]}" — it has no SWEEP entry of its own and fell back`,
      ).toBeUndefined()
      seen.set(value, sweep!)
    }
    // The sweeps must also be built from tokens, not literals, or a skin change strands them.
    for (const sweep of seen.values()) expect(sweep).toContain('var(--rank-')
  })

  it('every flair in the registry renders a visible icon, not an empty chip', () => {
    // `CosmeticFlair` returns null when the registry's icon key has no component behind it. That
    // is the silent hole: the shelf guard sees a resolvable flair, the member sees nothing.
    for (const [value, render] of Object.entries(FLAIR_RENDERS)) {
      const html = renderToStaticMarkup(<CosmeticFlair value={value} />)
      expect(html, `flair "${value}" renders NOTHING — its icon key "${render.icon}" has no component`).not.toBe('')
      expect(html, `flair "${value}" renders no icon`).toContain('<svg')
      expect(html, `flair "${value}" is unreadable to a screen reader`).toContain(render.label)
    }
  })

  it('a title renders its words, and one past the bound renders nothing', () => {
    expect(renderToStaticMarkup(<CosmeticTitle value="OG" />)).toContain('OG')
    expect(renderToStaticMarkup(<CosmeticTitle value={'x'.repeat(MAX_TITLE_LENGTH + 1)} />)).toBe('')
  })

  it('a value the registry retired paints nothing, rather than an empty halo', () => {
    // The other direction of the same promise: a member holding a value we stopped supporting gets
    // an ordinary avatar back, not a ring around nothing.
    const bare = renderToStaticMarkup(<i data-avatar />)
    expect(
      renderToStaticMarkup(
        <CosmeticBorder value="a-border-we-never-shipped">
          <i data-avatar />
        </CosmeticBorder>,
      ),
    ).toBe(bare)
    expect(renderToStaticMarkup(<CosmeticFlair value="a-flair-we-never-shipped" />)).toBe('')
    expect(renderToStaticMarkup(<CosmeticTitle value="   " />)).toBe('')
  })
})

describe('THE WIRING — the public profile is what paints them, and it still does', () => {
  it(`${PROFILE_PAGE} reads all three cosmetic columns and hands each to its component`, () => {
    expect(wiringProblems(profileSource)).toEqual([])
  })

  it('the profile page imports the paint from the one render module', () => {
    // A second copy of these components somewhere else is how the registry and the render drift
    // apart again, which is the whole reason there is exactly one module.
    expect(profileSource).toMatch(/from '@\/components\/profile\/profile-cosmetics'/)
  })
})

describe('NON-VACUITY — the wiring detector fires', () => {
  // Each mutation is applied to the REAL page source, so the detector is proven against the shape
  // it actually polices rather than a fixture written to suit it. The assertion is on the DELTA:
  // "this mutation ADDS this finding". Asserting the whole list instead would make a genuine
  // regression fail all five of these too, burying the one failure that names the real cause.
  const introduced = (mutated: string) => {
    expect(mutated, 'the mutation did not change the source — it is testing nothing').not.toBe(profileSource)
    const before = new Set(wiringProblems(profileSource))
    return wiringProblems(mutated).filter((p) => !before.has(p))
  }

  it('the control: the real page source produces no findings', () => {
    expect(wiringProblems(profileSource)).toHaveLength(0)
  })

  it('🔴 deleting a component from the page is reported', () => {
    // The literal revert this gate exists to catch: the columns are still selected, the registry is
    // still perfect, the components still exist — and the member's border is invisible again.
    expect(introduced(profileSource.replace(/<CosmeticBorder\s/g, '<span data-was-border '))).toEqual([
      expect.stringContaining('<CosmeticBorder value={equippedBorder}> is missing'),
    ])
  })

  it('🔴 painting the WRONG column is reported, not just an absent component', () => {
    expect(
      introduced(profileSource.replace('<CosmeticFlair value={equippedFlair}', '<CosmeticFlair value={equippedTitle}')),
    ).toEqual([expect.stringContaining('<CosmeticFlair value={equippedFlair}> is missing')])
  })

  it('🔴 dropping a column from the query is reported', () => {
    expect(introduced(profileSource.replace(/const equippedTitle = [^\n]*\n/, 'const equippedTitle = null\n'))).toEqual([
      expect.stringContaining('custom_title is not read into any binding'),
    ])
  })

  it('🔴 all three at once are reported, so the detector is not single-shot', () => {
    expect(wiringProblems('export default function Page() { return null }')).toHaveLength(3)
  })
})

/** The `background-image` a painted border drew, or null. */
function sweepOf(html: string): string | null {
  return /background-image:([^"]+)"/.exec(html)?.[1]?.trim() ?? null
}
