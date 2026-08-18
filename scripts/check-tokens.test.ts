import { describe, it, expect } from 'vitest'
import { tokenViolations, runCheck } from './check-tokens.mjs'

// Self-test for the token guard. Written after an audit found three ways it read green while real
// literals sat in the tree, all of the same species: the gate was measuring a narrower thing than
// its success message claimed.

const kinds = (src: string, path = 'components/x.tsx') =>
  (tokenViolations(path, src) as { kind: string; match: string }[]).map((v) => v.match)

describe('arbitrary type size — every unit, not just px', () => {
  // The regex was /text-\[\d+px\]/, so the canon's ban on arbitrary content type could be
  // sidestepped by writing the same size in another unit. Two live sites did exactly that.
  it('catches px, rem, em, pt', () => {
    expect(kinds('<p className="text-[10px]" />')).toEqual(['text-[10px]'])
    expect(kinds('<p className="text-[0.7rem]" />')).toEqual(['text-[0.7rem]'])
    expect(kinds('<p className="text-[0.85em]" />')).toEqual(['text-[0.85em]'])
    expect(kinds('<p className="text-[9pt]" />')).toEqual(['text-[9pt]'])
  })

  it('leaves clamp() alone — fluid DISPLAY sizing is a different class the canon does not ban', () => {
    expect(kinds('<h1 className="text-[clamp(2rem,5vw,4rem)]" />')).toEqual([])
  })

  it('leaves a var() or a named role alone', () => {
    expect(kinds('<p className="text-[var(--text-body)] text-3xs text-body-sm" />')).toEqual([])
  })
})

describe('counting occurrences, not lines', () => {
  // `code.match(re)` without /g returns only the FIRST match, so two literals on one line counted
  // as one. A gate that undercounts reports progress it did not make.
  it('reports both literals when two sit on the same line', () => {
    expect(kinds('<a style={{ color: "#AABBCC", background: "#112233" }} />')).toEqual([
      '#AABBCC',
      '#112233',
    ])
  })

  it('reports two arbitrary type sizes on one line', () => {
    const found = kinds('<p className="text-[10px] sm:text-[12px]" />')
    expect(found).toEqual(['text-[10px]', 'text-[12px]'])
  })

  it('does not leak regex lastIndex between files (the /g state trap)', () => {
    // A /g regex carries lastIndex across .matchAll calls if the same object is reused wrongly.
    // Two identical scans must give identical results; a leak makes the second one come back short.
    const src = '<a style={{ color: "#AABBCC" }} />'
    expect(kinds(src)).toEqual(kinds(src))
  })
})

describe('a file-level waiver must not waive classes nobody exempted', () => {
  // induction.tsx was allowlisted for a 4-hex Google brand mark, and the exemption silently
  // covered its arbitrary type as well. Scoped entries are the fix.
  const INDUCTION = 'app/onboarding/beta/induction.tsx'

  it('still exempts the hex palette it was granted for', () => {
    expect(kinds('const g = "#4285F4"', INDUCTION)).toEqual([])
  })

  it('no longer exempts arbitrary type in the same file', () => {
    expect(kinds('<p className="text-[10px]" />', INDUCTION)).toEqual(['text-[10px]'])
  })

  it('a bare (unscoped) allowlist entry still exempts everything', () => {
    // app/print/ is unscoped on purpose: a print document renders literal CSS, not the cascade.
    expect(kinds('<p className="text-[10px]" style={{ color: "#123456" }} />', 'app/print/qr/page.tsx')).toEqual([])
  })
})

describe('the tree is clean under the tightened rules', () => {
  it('runCheck finds no violations', () => {
    expect(runCheck()).toEqual([])
  })
})
