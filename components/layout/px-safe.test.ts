import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── THE px-safe CONTRACT ─────────────────────────────────────────────────────────────────────
//
// `.px-safe` (app/globals.css) SETS `padding-left` / `padding-right`. It does not add to them.
// So writing it beside a `px-*` utility is not "a gutter plus the notch inset" — it is two rules
// competing for one property, and which one wins is decided by stylesheet order, not by the order
// they appear in the class attribute.
//
// It lost that fight silently for three surfaces. `.px-safe` was `padding-left:
// env(safe-area-inset-left)`, and `env()` resolves to **0** on any display without a side inset —
// which is every phone in portrait. So `px-4 … px-safe` on the marketing menu sheet rendered the
// whole nav flush against the left edge of the screen, and `px-6 … px-safe` did the same to both
// site footers. Nothing threw: 0px is a perfectly legal padding.
//
// The utility now composes (`max(var(--px-safe-gutter, 0px), env(…))`), so the correct spelling is
// ONE utility carrying its gutter as a variable:
//
//     class="px-safe [--px-safe-gutter:1rem]"
//
// 🔴 WHY THIS IS A SOURCE TEST AND NOT PART OF THE @overflow GATE. It was checked: reverting the
// fix and re-running `@overflow` against the opened menu sheet PASSES. A zeroed gutter is not
// overflow — nothing crosses the viewport edge, the content is merely jammed against it — so the
// browser gate is structurally blind to this defect and always will be. The two instruments cover
// different failures and neither is a substitute for the other.

/** Every .tsx under components/ and app/, minus build output. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const ROOT = new URL('../../', import.meta.url).pathname
const FILES = [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))]

describe('px-safe never shares an element with another horizontal padding', () => {
  it('finds the call sites at all (guards against a silently-empty sweep)', () => {
    const users = FILES.filter((f) => readFileSync(f, 'utf8').includes('px-safe'))
    expect(users.length).toBeGreaterThanOrEqual(4)
  })

  it('has no element combining px-safe with px-* / pl-* / pr-*', () => {
    const offenders: string[] = []

    for (const file of FILES) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('px-safe')) continue

      // Each quoted/backticked class string on a line that mentions px-safe.
      for (const line of src.split('\n')) {
        if (!line.includes('px-safe')) continue
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue

        const classes = line.split(/\s+/).filter(Boolean)
        const hasSafe = classes.some((c) => c.replace(/["'`{}]/g, '') === 'px-safe')
        if (!hasSafe) continue

        const competing = classes
          .map((c) => c.replace(/["'`{}]/g, ''))
          // The variable form is the sanctioned way to carry a gutter.
          .filter((c) => c !== 'px-safe' && !c.startsWith('[--px-safe-gutter'))
          .filter((c) => /^(px|pl|pr)-/.test(c))

        if (competing.length > 0) {
          offenders.push(
            `${file.replace(ROOT, '')}: px-safe beside ${competing.join(', ')}\n` +
              `      ${line.trim().slice(0, 140)}`,
          )
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? 'px-safe SETS padding-inline, it does not add to it — the other utility is silently ' +
          'discarded and the element renders with whichever won the cascade (0px in portrait).\n' +
          'Carry the gutter on px-safe instead: class="px-safe [--px-safe-gutter:1rem]".\n\n' +
          offenders.join('\n')
        : undefined,
    ).toEqual([])
  })
})

describe('the utility itself still composes', () => {
  const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

  it('maxes the gutter against the inset rather than overwriting it', () => {
    expect(css).toContain('max(var(--px-safe-gutter, 0px), env(safe-area-inset-left))')
    expect(css).toContain('max(var(--px-safe-gutter, 0px), env(safe-area-inset-right))')
  })

  it('defaults to 0px, so a bare px-safe is byte-identical to the old behaviour', () => {
    // The app shell body and the claim page pass no gutter and must not gain one.
    expect(css).toMatch(/--px-safe-gutter,\s*0px/)
  })
})
