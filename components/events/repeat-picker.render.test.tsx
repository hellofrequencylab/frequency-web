// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { RepeatPicker } from './repeat-picker'

// WHAT A HOST ACTUALLY SEES IN THE REPEATS CONTROL (owner, 2026-09-10: "I like the custom settings
// editor you created but I don't like the preset dropdowns. Those are confusing. Make it so only
// the Settings editor is showing with it set to 1 time, does not repeat as a default setting").
//
// The engine's own suite (lib/events/repeat-rule.test.ts) proves what a rule MEANS. Nothing proved
// what the control OFFERS, and the thing the owner reported is entirely a question of what is in
// the menu — a control can emit perfect RRULEs through a menu nobody can read. So this pins the
// three claims the reversal makes, at the DOM:
//
//   1. the menu is five frequencies and no sentences,
//   2. the default is "does not repeat" with the editor shut, and
//   3. choosing a frequency opens the editor in place, with no "Custom" step in between.

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

function menuOptions(el: HTMLElement): string[] {
  return [...el.querySelectorAll('select')[0].options].map((o) => o.text)
}

describe('the menu asks how often, and nothing else', () => {
  it('🔴 offers five frequencies, and not one preset sentence', () => {
    const el = mount(<RepeatPicker value="" onChange={() => {}} startsAt={WED} />)
    expect(menuOptions(el)).toEqual(['Does not repeat', 'Daily', 'Weekly', 'Monthly', 'Yearly'])
    // The exact labels the retired menu built for this date. Any of them appearing anywhere in the
    // control is the presets coming back, which is the thing that was reported as confusing.
    for (const preset of [
      'Weekly on Wednesday',
      'Every 2 weeks on Wednesday',
      'Every weekday, Monday to Friday',
      'Monthly on the third Wednesday',
      'Annually on September 16',
      'Custom',
    ]) {
      expect(el.textContent, `"${preset}" is back in the picker`).not.toContain(preset)
    }
  })

  it('opens on "does not repeat", with the editor shut and the sentence saying so', () => {
    const el = mount(<RepeatPicker value="" onChange={() => {}} startsAt={WED} />)
    expect(el.querySelectorAll('select')[0].value).toBe('__none__')
    // One control on the page: no interval, no weekday row, no end rule.
    expect(el.querySelectorAll('input')).toHaveLength(0)
    expect(el.querySelectorAll('select')).toHaveLength(1)
    expect(el.textContent).toContain('This happens once.')
  })

  it('a repeating value opens the editor in place: interval, weekdays, and the end rule', () => {
    const el = mount(
      <RepeatPicker value="FREQ=WEEKLY;INTERVAL=2;BYDAY=WE" onChange={() => {}} startsAt={WED} />,
    )
    expect(el.querySelectorAll('select')[0].value).toBe('WEEKLY')
    // The unit is PRINTED beside the interval rather than asked a second time.
    expect(el.textContent).toContain('Repeat every')
    expect(el.textContent).toContain('weeks')
    expect(el.querySelectorAll('select')).toHaveLength(1)
    // The weekday row, with the anchor's own day pressed.
    const wednesday = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Wednesday'))
    expect(wednesday?.getAttribute('aria-pressed')).toBe('true')
    // And the end rule, which used to sit outside the panel.
    expect(el.textContent).toContain('Ends')
    expect(el.textContent).toContain('Every 2 weeks on Wednesday')
  })

  it('emits the rule the menu means, and clears it back to empty', () => {
    const emitted: string[] = []
    const el = mount(<RepeatPicker value="" onChange={(v) => emitted.push(v)} startsAt={WED} />)
    const menu = el.querySelectorAll('select')[0]
    act(() => {
      menu.value = 'WEEKLY'
      menu.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // Seeded from the start date, so a host who picks "Weekly" gets Wednesdays without saying so.
    expect(emitted.at(-1)).toBe('FREQ=WEEKLY;BYDAY=WE')

    const el2 = mount(
      <RepeatPicker value="FREQ=WEEKLY;BYDAY=WE;UNTIL=20261230" onChange={(v) => emitted.push(v)} startsAt={WED} />,
    )
    const menu2 = el2.querySelectorAll('select')[0]
    act(() => {
      menu2.value = '__none__'
      menu2.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // "Does not repeat" drops the UNTIL with the rule. A leftover end date is how a rail ends up
    // saying "Repeats until 30 December" beside a control that says it never repeats.
    expect(emitted.at(-1)).toBe('')
  })
})

describe('the presets cannot come back by accident', () => {
  it('🔴 the picker imports no preset builder, because there is no longer one to import', () => {
    const source = readFileSync('components/events/repeat-picker.tsx', 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
    expect(code).not.toContain('repeatPresets')
    expect(code).not.toContain('matchRepeatPreset')
    // The engine side of the same claim: the functions are deleted, not merely unused.
    const engine = readFileSync('lib/events/repeat-rule.ts', 'utf8')
    expect(engine).not.toContain('export function repeatPresets')
    expect(engine).not.toContain('export function matchRepeatPreset')
  })
})
