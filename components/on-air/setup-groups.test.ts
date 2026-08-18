import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// LIVE-046 — every On Air setup heading names the controls under it.
//
// The defect this pins is not a mislabelled element; it is an UNLABELLED GROUP, which no existing
// gate could see. `pnpm check:labels` (ADR-966) checks that every <label> names exactly one
// control, and these headings are <p> elements, correctly — so it passed, and rightly. A screen
// reader still arrived at a grid of ModeButton/Chip controls with no idea what the choice was
// about: "Walk, button. Run, button." and no "Mode" anywhere.
//
// It also pins the two headings that must NOT become groups, because a sweep that converted every
// one of them would be wrong twice, and "wrong twice in the accessible direction" is still wrong:
// a `role="group"` around a read-only row announces a grouping that has no controls in it, and one
// around a heading that is already a button's own accessible name announces it a second time.

const MOVEMENT = 'components/on-air/movement-session.tsx'
const SESSION = 'components/on-air/session.tsx'
const read = (p: string) => readFileSync(p, 'utf8')

// The comment block above `Group` explains all of this, and every `<Label>` inside it would
// otherwise be counted as code. Strip line comments and block comments before matching.
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the Group atom is the pattern, not a convention', () => {
  it.each([MOVEMENT, SESSION])('%s binds heading to controls in ONE component', (file) => {
    const src = read(file)
    const group = src.slice(src.indexOf('function Group('))
    expect(group, `${file} has no Group atom`).not.toBe('')
    // The three halves that make it a group: the role, the association, and an id that is unique
    // across the branches which render two "Minutes" headings.
    expect(group).toMatch(/role="group"/)
    expect(group).toMatch(/aria-labelledby=\{id\}/)
    expect(group).toMatch(/const id = useId\(\)/)
    expect(group).toMatch(/<Label id=\{id\}>/)
    expect(src).toMatch(/import \{[^}]*\buseId\b[^}]*\} from 'react'/)
  })
})

describe('every control group on the setup screens has a name', () => {
  it('Get Moving: nine groups, and no bare heading left over one', () => {
    const src = code(read(MOVEMENT))
    expect((src.match(/<Group label=/g) ?? []).length).toBe(9)
    // Every remaining <Label> in this file would be a heading naming nothing.
    expect(src.match(/<Label>/g) ?? []).toEqual([])
  })

  it('Be Still: three groups, and exactly two headings deliberately left alone', () => {
    const src = code(read(SESSION))
    expect((src.match(/<Group label=/g) ?? []).length).toBe(3)
    const bare = src.match(/<Label>([^<]*)<\/Label>/g) ?? []
    expect(bare.length).toBe(2)
    // Named, not merely counted — a third exception must be argued for, not absorbed.
    expect(bare.join(' ')).toContain('Minutes') // the read-only "Set by the practice" row
    expect(bare.join(' ')).toContain('Sounds') // already the <button aria-expanded>'s own name
  })

  it('the read-only Minutes row really has no control in it', () => {
    // The reason that exception is correct, asserted rather than asserted-about: the block under
    // that heading is two <span>s. If a control is ever added there, this fails and the heading
    // needs to become a Group.
    const src = read(SESSION)
    const at = src.indexOf('<Label>Minutes</Label>')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, src.indexOf('</div>', at))
    expect(block).not.toMatch(/<button|<input|<select|<Chip|<ModeButton|onClick=/)
  })

  it('the Sounds heading really is inside the disclosure button', () => {
    const src = read(SESSION)
    const at = src.indexOf('<Label>Sounds')
    const before = src.slice(Math.max(0, at - 500), at)
    expect(before).toMatch(/aria-expanded=/)
    expect(before.lastIndexOf('<button')).toBeGreaterThan(before.lastIndexOf('</button>'))
  })
})
