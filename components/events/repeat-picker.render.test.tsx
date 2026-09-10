// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { RepeatPicker } from './repeat-picker'

// WHAT A HOST ACTUALLY SEES IN THE REPEAT CONTROL.
//
// The engine's own suite (lib/events/repeat-rule.test.ts) proves what a rule MEANS. Nothing proved
// what the control OFFERS, and both owner reports on this control were entirely about that: a
// control can emit perfect RRULEs through an interface nobody can read.
//
//   Report 1 (ADR-1303): the start-derived preset menu came out. "I don't like the preset dropdowns.
//   Those are confusing."
//   Report 2 (ADR-1305): what replaced it was still a dropdown, just a shorter one. "I want a new
//   event to be set to a date with a switch to turn on repeating. When they hit the Repeat Event
//   switch, it opens the custom repeat selector."
//
// So this pins the three claims the switch makes: a new event shows a switch and nothing else, the
// switch opens the editor in place, and no cadence menu sits upstream of it.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

/** Wednesday 16 September 2026 — the date the retired preset menu derived its labels from, kept
 *  here on purpose: if a start-derived sentence ever comes back, it comes back on this date. */
const WED = '2026-09-16T10:00:00.000Z'

const switchOf = (el: HTMLElement) => el.querySelector('[role="switch"]') as HTMLButtonElement

describe('a new event is a date, with a switch to turn on repeating', () => {
  it('🔴 shows a switch and nothing else: no editor, no cadence menu', () => {
    const el = mount(<RepeatPicker value="" onChange={() => {}} startsAt={WED} />)
    const toggle = switchOf(el)
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    // The whole editor is absent, which is the point: the control is one switch until asked.
    expect(el.querySelectorAll('select')).toHaveLength(0)
    expect(el.querySelectorAll('input')).toHaveLength(0)
    expect(el.textContent).toContain('This happens once.')
  })

  it('names the switch after the question it asks', () => {
    const el = mount(<RepeatPicker value="" onChange={() => {}} startsAt={WED} />)
    const labelled = switchOf(el).getAttribute('aria-labelledby')!
    expect(el.querySelector(`#${CSS.escape(labelled)}`)?.textContent).toBe('Repeat event')
  })

  it('🔴 carries no cadence menu upstream of the switch, and no preset menu anywhere', () => {
    // Report 2 in one assertion. A menu whose first option is the default and whose other options
    // only open a panel is a switch wearing a dropdown's clothes; that is what came out.
    const el = mount(<RepeatPicker value="FREQ=WEEKLY;INTERVAL=3;BYDAY=WE" onChange={() => {}} startsAt={WED} />)
    const options = [...el.querySelectorAll('option')].map((o) => o.text)
    expect(options).not.toContain('Does not repeat')
    // ⚠️ ASSERTED ON THE OPTIONS, NOT ON THE TEXT, and the distinction is the whole point. The
    // retired preset LABELS were sentences `describeRepeat` still produces — "Weekly on Wednesday"
    // is exactly what the read-back line says for that rule, correctly. What came out was a MENU of
    // them. So the check is that no such sentence is selectable, not that the words never appear:
    // a text-level assertion here would fail on the sentence the control is supposed to print.
    for (const preset of [
      'Weekly on Wednesday',
      'Every 2 weeks on Wednesday',
      'Every weekday, Monday to Friday',
      'Monthly on the third Wednesday',
      'Annually on September 16',
    ]) {
      expect(options, `"${preset}" is back in a menu`).not.toContain(preset)
    }
    // "Custom" was the option that hid the editor, and it has no read-back twin, so it is checked
    // against the whole control.
    expect(el.textContent).not.toContain('Custom')
    // The only menu in the control is the unit, and it offers units.
    expect(el.querySelectorAll('select')).toHaveLength(1)
    expect(options).toEqual(['days', 'weeks', 'months', 'years'])
  })
})

describe('the switch opens the custom editor in place', () => {
  it('turning it on emits a weekly rule on the event’s own weekday', () => {
    const emitted: string[] = []
    const el = mount(<RepeatPicker value="" onChange={(v) => emitted.push(v)} startsAt={WED} />)
    act(() => switchOf(el).click())
    expect(emitted.at(-1)).toBe('FREQ=WEEKLY;BYDAY=WE')
  })

  it('a repeating value shows the whole editor: interval, unit, weekdays, and the end rule', () => {
    const el = mount(
      <RepeatPicker value="FREQ=WEEKLY;INTERVAL=2;BYDAY=WE" onChange={() => {}} startsAt={WED} />,
    )
    expect(switchOf(el).getAttribute('aria-checked')).toBe('true')
    // The cadence is chosen HERE, inside the editor, not by a control above it.
    expect(el.textContent).toContain('Repeat every')
    expect(el.textContent).toContain('Unit')
    const unit = el.querySelector('select') as HTMLSelectElement
    expect(unit.value).toBe('WEEKLY')
    expect([...unit.options].map((o) => o.text)).toEqual(['days', 'weeks', 'months', 'years'])
    // The weekday row, with the anchor's own day pressed.
    const wednesday = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Wednesday'))
    expect(wednesday?.getAttribute('aria-pressed')).toBe('true')
    expect(el.textContent).toContain('Ends')
    expect(el.textContent).toContain('Every 2 weeks on Wednesday')
  })

  it('the monthly arm is two controls from the switch, which is what "every third Thursday" needs', () => {
    const el = mount(<RepeatPicker value="FREQ=MONTHLY;BYDAY=WE;BYSETPOS=3" onChange={() => {}} startsAt={WED} />)
    expect(el.textContent).toContain('Which day')
    expect(el.textContent).toContain('On day 16 of the month')
    expect(el.textContent).toContain('Monthly on the third Wednesday')
  })

  it('🔴 turning it off clears the end date with the rule', () => {
    // A leftover UNTIL is how a rail ends up saying "Repeats until 30 December" beside a control
    // that says the event does not repeat.
    const emitted: string[] = []
    const el = mount(
      <RepeatPicker value="FREQ=WEEKLY;BYDAY=WE;UNTIL=20261230" onChange={(v) => emitted.push(v)} startsAt={WED} />,
    )
    act(() => switchOf(el).click())
    expect(emitted.at(-1)).toBe('')
  })
})

describe('the presets cannot come back by accident', () => {
  it('🔴 the picker imports no preset builder, because there is no longer one to import', () => {
    const source = readFileSync('components/events/repeat-picker.tsx', 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
    expect(code).not.toContain('repeatPresets')
    expect(code).not.toContain('matchRepeatPreset')
    // It composes the kit's Switch rather than hand-rolling a toggle, which is what keeps the
    // keyboard operation, the focus ring and `role="switch"` in one place.
    expect(code).toContain("from '@/components/ui/switch'")
    // The engine side of the same claim: the preset builders are deleted, not merely unused.
    const engine = readFileSync('lib/events/repeat-rule.ts', 'utf8')
    expect(engine).not.toContain('export function repeatPresets')
    expect(engine).not.toContain('export function matchRepeatPreset')
  })
})
