import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PRODUCTION AHEAD OF DAWN, HELD OPEN UNTIL IT IS SENT BACK.
//
// 🔴 WHAT A GREEN RUN HERE DOES NOT MEAN (added 2026-08-25). This file asserts that the divergences
// it FINDS equal the divergences it DECLARES. Both sets are eight rows. Green therefore means "the
// two stylesheets disagree in exactly the ways written down below" — it never means they agree, and
// it says nothing at all about whether DAWN's file is current.
//
// It is not. `design_handoff/dawn/` is a hand-copied photocopy of the external Claude Design
// project, and the 2026-08-25 round was never copied in: DAWN applied all five corrections below on
// its side and said so in `design_handoff/CHANGES.md` §2, while the file this test reads still holds
// the pre-correction values. So on 2026-08-25 this test was green, the ledger was accurate, and the
// outbound sheet was nevertheless asking DAWN to redo three-week-old work.
//
// `scripts/check-dawn-bundle.mjs` measures the freshness half, because nothing here can. When the
// bundle IS re-exported, that guard fails and names the three files that must move together: its own
// BUNDLE_ROUND, the ledger below, and `design_handoff/PROD-AHEAD.md`. Expect five of the eight rows
// below to go stale in that same change — which is this test's failure mode 2, working as designed.
//
// `design_handoff/SYNC.md` § "Going the other way" makes sync two-directional: when the repo
// changes something DAWN documents, it goes back on the next round. Four colour tokens have been
// waiting to go back since 2026-08-05 — production fixed AA failures that DAWN's artifact still
// carries, so the next inbound handoff, applied faithfully, would put them back:
//
//   --color-focus-ring        DAWN #E2912F → prod #B86A15   (PR #2036, 1.75:1 → 3.87:1)
//   --color-text-on-broadcast DAWN #FFFFFF → prod #1A1206   (white on the broadcast cyan fails AA)
//   --color-text-subtle       DAWN #8F8675 → prod #6E6558   (the contrast sweep darkened it)
//   --color-text-on-primary   DAWN #FFFFFF → prod #1A1206   ← THIS ROW IS NO LONGER TRUE
//
// The fourth row is why this file is a test and not a paragraph. Production reverted
// `--color-text-on-primary` to #FFFFFF on 2026-08-06 and split the rank-core glyph out into its own
// `--color-text-on-rank: #1A1206`, because the moment on-primary became ink every rank core
// inherited it and gold fell to 2.46:1. The plan doc still carries the old row. Sending it would
// have asked DAWN to make on-primary ink — reintroducing, from the sheet meant to PREVENT
// regressions, the exact failure the split fixed. A prose list of divergences goes stale silently;
// that is its whole failure mode, and it had already happened here before anyone sent it.
//
// So the ledger below is derived-and-compared rather than written. The test fails THREE ways, and
// all three are the ways a handoff sheet goes wrong:
//
//   1. A NEW divergence appears and nobody declared it → it would have been sent back as "no
//      change" and DAWN would overwrite it on the next round.
//   2. A declared divergence CLOSED (the two agree again) → the row is stale, exactly like
//      --color-text-on-primary, and sending it actively harms.
//   3. A declared divergence changed VALUE on either side → the sheet quotes a hex neither
//      project holds.
//
// And the sheet itself is checked: every token named here must appear in
// `design_handoff/PROD-AHEAD.md`, which is the artifact the next outbound handoff copies. A
// divergence that exists in CSS but not in the sheet fails the build, which is the only way
// "it goes back on the next round" can be a fact rather than an intention.

const PROD = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')
const DAWN = readFileSync(
  join(process.cwd(), 'design_handoff', 'dawn', 'tokens', 'colors.css'),
  'utf8',
)
const SHEET = readFileSync(join(process.cwd(), 'design_handoff', 'PROD-AHEAD.md'), 'utf8')

type Mode = 'light' | 'dark'

/** The selector each mode's palette is authored under, in BOTH projects. */
const SELECTOR: Record<Mode, string> = { light: ':root', dark: '.dark' }

/**
 * Every custom property declared in one top-level block, comments stripped.
 *
 * The selector is matched at the START of a line, which is load-bearing: `globals.css` opens with
 * `@custom-variant dark (&:where(.dark, .dark *))`, and a bare `indexOf('.dark')` lands inside that
 * at-rule and then brace-matches its way through half the stylesheet. The first version of this
 * helper did exactly that and reported 49 dark-mode divergences, all of them fiction.
 */
function palette(css: string, mode: Mode): Map<string, string> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const opener = new RegExp(`^${SELECTOR[mode].replace('.', '\\.')}\\s*\\{`, 'm')
  const start = text.search(opener)
  if (start === -1) throw new Error(`no top-level ${SELECTOR[mode]} block`)
  let depth = 0
  let i = text.indexOf('{', start)
  const open = i
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) break
  }
  const out = new Map<string, string>()
  for (const m of text.slice(open + 1, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, ' ').toUpperCase())
  }
  return out
}

/** A token both projects declare, with different values. */
interface Divergence {
  token: string
  mode: Mode
  dawn: string
  prod: string
}

function divergences(): Divergence[] {
  const out: Divergence[] = []
  for (const mode of ['light', 'dark'] as Mode[]) {
    const prod = palette(PROD, mode)
    for (const [token, dawn] of palette(DAWN, mode)) {
      const mine = prod.get(token)
      if (mine !== undefined && mine !== dawn) out.push({ token, mode, dawn, prod: mine })
    }
  }
  return out.sort((a, b) => `${a.mode}${a.token}`.localeCompare(`${b.mode}${b.token}`))
}

/** Colour tokens production declares that DAWN's sheet has no row for at all. */
function prodOnly(mode: Mode): string[] {
  const dawn = palette(DAWN, mode)
  return [...palette(PROD, mode).keys()]
    .filter((t) => t.startsWith('--color-') && !dawn.has(t))
    .sort()
}

// ── THE LEDGER. Read as: "these are the differences, and every one of them is deliberate." ──────
// Written out in full rather than snapshotted so a reviewer sees the hexes in the diff.
const DECLARED: Divergence[] = [
  // ✅ EMPTY SINCE 2026-08-26, AND THAT IS THE FILE WORKING, NOT A HOLE IN IT.
  //
  // All eight rows that stood here closed at once. DAWN applied every one on 2026-08-25 and said
  // so in `design_handoff/CHANGES.md` §2 — five corrections, the `--color-surface-post` aliasing in
  // both modes, and twelve additions. The vendored copy did not move for three weeks (LIVE-127),
  // so this ledger went on describing a FILE rather than a PROJECT. That gap is ADR-1163, and
  // `scripts/check-dawn-bundle.mjs` is what measures it now.
  //
  // ⚠️ THE VALUES WERE TRANSCRIBED, NOT EXPORTED. `design_handoff/dawn/tokens/colors.css` was
  // edited to the values CHANGES.md §2 documents, with the additions taking their hexes from
  // `PROD-AHEAD.md` §5 — CHANGES.md names those twelve but prints no values. That is faithful to
  // two independent statements (DAWN's own changelog, and the owner confirming it in-thread) and
  // it is NOT a DAWN export. The rest of the bundle is still the 2026-08-03 photocopy.
  //
  // WHAT AN EMPTY LEDGER STILL CATCHES, which is the assertion that carries the weight: the moment
  // either stylesheet moves and the two disagree, `divergences()` returns a row this list does not
  // have and the test fails. Empty means "they agree today", re-proven on every run — never
  // "nobody looked".
]

/** Tokens production has and DAWN does not. Sent as ADDITIONS, not as corrections. */
const DECLARED_PROD_ONLY: Record<Mode, string[]> = {
  // Empty for the same reason as DECLARED, and closed in the same change: the twelve additions
  // CHANGES.md §2 lists were transcribed into the vendored sheet on 2026-08-26, so there is no
  // colour token production declares that DAWN has no row for. A NEW prod-only token fails this
  // the moment it appears, which is the only job this list has.
  light: [],
  dark: [],
}

const key = (d: Divergence) => `${d.mode} ${d.token} DAWN ${d.dawn} → prod ${d.prod}`

describe('every place production is ahead of DAWN is declared, and goes back', () => {
  it('reads both palettes at all — a green over an empty scan is the failure this guards', () => {
    // ADR-962. If either file moves or the block shape changes, fail loudly rather than
    // reporting "no divergences" over two empty maps.
    expect(palette(PROD, 'light').size).toBeGreaterThan(80)
    expect(palette(DAWN, 'light').size).toBeGreaterThan(60)
    expect(palette(PROD, 'dark').size).toBeGreaterThan(40)
    expect(palette(DAWN, 'dark').size).toBeGreaterThan(40)
  })

  it('has no value divergence that is not in the ledger, and no ledger row that is stale', () => {
    // Both directions in one assertion, because both are ways the outbound sheet lies:
    // an undeclared divergence gets overwritten on the next inbound round; a declared one that
    // has since CONVERGED gets sent as a correction and un-fixes something.
    expect(divergences().map(key).sort()).toEqual(DECLARED.map(key).sort())
  })

  it('declares every colour token DAWN has no row for', () => {
    expect(prodOnly('light')).toEqual(DECLARED_PROD_ONLY.light)
    expect(prodOnly('dark')).toEqual(DECLARED_PROD_ONLY.dark)
  })

  it('names every one of them in the outbound sheet the next handoff copies', () => {
    // This is the assertion that turns SYNC.md's standing rule into a fact. The ledger above
    // proves the divergence is KNOWN; this proves it is WRITTEN DOWN where the handoff picks it up.
    const named = new Set([
      ...DECLARED.map((d) => d.token),
      ...DECLARED_PROD_ONLY.light,
      ...DECLARED_PROD_ONLY.dark,
    ])
    const missing = [...named].filter((t) => !SHEET.includes(t)).sort()
    expect(missing).toEqual([])
  })

  it('quotes the live hex in the sheet, not a remembered one', () => {
    // The stale --color-text-on-primary row survived in prose for eleven days. A sheet that
    // names a token but quotes last month's value is the same defect one step quieter.
    const wrong = DECLARED.filter((d) => !SHEET.includes(d.prod) && !d.prod.startsWith('VAR('))
      .map(key)
      .sort()
    expect(wrong).toEqual([])
  })
})
