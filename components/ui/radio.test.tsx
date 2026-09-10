import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { Radio, radioClasses } from './radio'

// STATE TEST for the Radio primitive (docs/INTERACTION-STATES.md §2, Action control · §6).
//
// The primitive is a NATIVE `type="radio"` wearing its own chrome, which is the whole design: every
// state styles itself off a real DOM state (`:checked`, `:disabled`, `:focus-visible`,
// `aria-invalid`) with no JS mirror to fall out of sync. So the states below are asserted where they
// actually live — in the class string and on the element — rather than by driving a browser.
//
// It also guards the two things a hand-rolled radio kept getting wrong, and that this primitive
// exists to stop: the tap floor, and where that floor lands.

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

describe('Radio · rest', () => {
  it('is a real native radio, not a role-annotated button', () => {
    // Arrow-key roving, Home/End, form submission and the browser's own announcement are all free
    // here and all hand-rolled otherwise. This is the assertion that keeps them.
    const m = html(<Radio name="g" aria-label="One" />)
    expect(m).toContain('type="radio"')
    expect(m).toContain('name="g"')
    expect(m).not.toContain('role="radio"')
  })

  it('wears the kit ring at rest: a token border on the surface fill, and a full round', () => {
    expect(radioClasses).toContain('rounded-full')
    expect(radioClasses).toContain('border-border-strong')
    expect(radioClasses).toContain('bg-surface')
    // `appearance-none` is what makes the input itself the visible ring rather than a UA control
    // sitting beside one.
    expect(radioClasses).toContain('appearance-none')
  })
})

describe('Radio · checked, error and disabled', () => {
  it('fills amber when checked, from the class string rather than a JS branch', () => {
    expect(radioClasses).toContain('checked:border-primary')
    expect(radioClasses).toContain('checked:bg-primary')
    // The dot is a sibling revealed by `peer-checked`, so it cannot disagree with the input.
    expect(radioClasses).toContain('peer')
    expect(html(<Radio name="g" aria-label="One" defaultChecked />)).toContain('peer-checked:opacity-100')
  })

  it('takes the danger border from aria-invalid, so the a11y attribute and the look cannot drift', () => {
    expect(radioClasses).toContain('aria-[invalid=true]:border-danger')
    expect(html(<Radio name="g" aria-label="One" aria-invalid />)).toContain('aria-invalid="true"')
  })

  it('fades and refuses the cursor when disabled, and fades the label exactly once', () => {
    expect(radioClasses).toContain('disabled:opacity-50')
    expect(radioClasses).toContain('disabled:cursor-not-allowed')
    const m = html(<Radio name="g" label="One" disabled />)
    expect(m).toContain('disabled=""')
    expect(m).toContain('cursor-not-allowed')
    // 🔴 ONE fade, not two. `radioClasses` already dims the ring on `:disabled`, so a wrapper-level
    // opacity would compound the pair to 25%. The wrapper carries the cursor; the TEXT carries the
    // fade. Checkbox records the same rule for the same reason.
    const wrapper = m.slice(0, m.indexOf('<input'))
    expect(wrapper).not.toContain('opacity-50')
    expect(m.slice(m.indexOf('</span>'))).toContain('opacity-50')
  })
})

describe('Radio · focus-visible', () => {
  it('declares NO focus class of its own, so it inherits the actionable amber ring', () => {
    // app/globals.css paints the 3px `--color-focus-ring` on a focused input. A radio is a control
    // you act on, not a field you type in, so it must NOT pick up the calm neutral halo that
    // `fieldClasses` gives text fields. Inventing a third treatment here would break that split.
    expect(radioClasses).not.toContain('focus:')
    expect(radioClasses).not.toContain('focus-visible:')
    expect(radioClasses).not.toContain('ring-')
  })
})

describe('Radio · the tap floor, and where it lands', () => {
  it('🔴 labelled, the floor is on the LABEL — the real hit area — and never on the ring', () => {
    const m = html(<Radio name="g" label="One" />)
    const label = m.slice(0, m.indexOf('<input'))
    expect(label).toContain('tap-target')
    // A `tap-target` on this input would not grow a hit area around the ring; the input IS the
    // ring, so it would grow the RING — 44px on a coarse pointer, more on the kids generations,
    // with the dot still frozen in the middle. Checkbox shipped that bug and recorded it.
    expect(radioClasses).not.toContain('tap-target')
  })

  it('unlabelled, the floor is on the WRAPPER, which is still a real hit area', () => {
    const m = html(<Radio name="g" aria-label="One" />)
    expect(m.slice(0, m.indexOf('<input'))).toContain('tap-target')
  })
})

describe('Radio · the group is the name', () => {
  it('renders the label beside the ring with implicit association, so no id is minted', () => {
    const m = html(<Radio name="g" label="Weekly" hint="Every seven days" />)
    expect(m).toContain('<label')
    expect(m).toContain('Weekly')
    expect(m).toContain('Every seven days')
    // Matched as ATTRIBUTES, not substrings: `aria-[invalid=true]` in the class string contains
    // the letters "id=", and a bare `toContain` reads that as an id and fails on a correct render.
    expect(m).not.toMatch(/\sid="/)
    expect(m).not.toMatch(/\sfor="/)
  })

  it('the two admin matrices compose it rather than hand-rolling a radio', () => {
    // The sweep this primitive was built to make possible. Both matrices carried a raw
    // `type="radio"` at 14px with its own `accent-*` colour and its own label wiring, which is
    // under any tap floor and drifts from the kit on every edit. The repeat picker joins them as
    // a third consumer in the PR that adds it.
    for (const file of [
      'app/(main)/admin/roles/permission-grid.tsx',
      'components/admin/menu/role-mode-matrix.tsx',
    ]) {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain("from '@/components/ui/radio'")
      expect(src).not.toContain('type="radio"')
    }
  })

  it('the repeat picker composes it rather than hand-rolling a radio', () => {
    // The consumer the primitive was built for, and the reason it is native: five hand-rolled
    // radios in one control (components/events/repeat-picker.tsx, ADR-1299) - two end-mode rows
    // and a by-date-vs-nth-weekday pair, each a real group that wants arrow-key roving.
    const picker = readFileSync('components/events/repeat-picker.tsx', 'utf8')
    expect(picker).toContain("from '@/components/ui/radio'")
    expect(picker).not.toContain('type="radio"')
  })
})
