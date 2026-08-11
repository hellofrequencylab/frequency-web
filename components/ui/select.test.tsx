// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Select, selectClasses } from './select'
import { fieldChromeShape, fieldToneNeutral } from './field'

// Locks the Field state set from docs/INTERACTION-STATES.md §2 for the native dropdown — rest,
// focus-visible, error, disabled — plus the `tone` axis the chip filters asked for. The rule the
// tone must never break: a select is a FIELD, so it focuses with the calm neutral halo and never
// the amber chrome ring, whatever colour it rests in.

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

const el = (node: React.ReactNode) => mount(node).querySelector('select')!

describe('selectClasses states', () => {
  it('wears the field shape, so a form never grows a second focus treatment', () => {
    for (const c of fieldChromeShape.split(' ')) expect(selectClasses.split(' ')).toContain(c)
  })

  it('has a rest look, a focus look, an error look and a disabled look', () => {
    expect(selectClasses).toContain('border-border')
    expect(selectClasses).toContain('focus:border-border-strong')
    expect(selectClasses).toContain('aria-[invalid=true]:border-danger')
    expect(selectClasses).toContain('disabled:opacity-50')
    expect(selectClasses).toContain('disabled:cursor-not-allowed')
  })

  it('keeps the calm neutral halo, never the amber chrome ring', () => {
    expect(selectClasses).toContain('focus:ring-border-strong/30')
    expect(selectClasses).not.toContain('focus:ring-primary')
  })

  it('clears the touch floor and reserves the chevron gutter', () => {
    expect(selectClasses).toContain('tap-target')
    expect(selectClasses).toContain('appearance-none')
    expect(selectClasses).toContain('pr-9')
  })
})

describe('Select tone', () => {
  it('default is the neutral field palette', () => {
    const classes = el(<Select aria-label="Kind" options={['a']} />).className.split(' ')
    for (const c of fieldToneNeutral.split(' ')) expect(classes).toContain(c)
    expect(classes).toContain('bg-surface')
  })

  it('active swaps border, fill and text in one move — the swap the chip filters make', () => {
    const classes = el(<Select aria-label="Kind" tone="active" options={['a']} />).className.split(' ')
    expect(classes).toContain('border-primary')
    expect(classes).toContain('bg-primary-bg')
    expect(classes).toContain('text-primary-strong')
  })

  it('emits exactly one fill, one border colour and one text colour per tone', () => {
    for (const tone of ['default', 'active'] as const) {
      const classes = el(<Select aria-label="Kind" tone={tone} options={['a']} />).className.split(' ')
      expect(classes.filter((c) => c.startsWith('bg-'))).toHaveLength(1)
      expect(classes.filter((c) => /^border-(?!\d)/.test(c))).toHaveLength(1)
      expect(classes.filter((c) => /^text-(?:text|primary-strong|muted|subtle)$/.test(c))).toHaveLength(1)
    }
  })

  it('an active chip still focuses like a field, not like a button', () => {
    const classes = el(<Select aria-label="Kind" tone="active" options={['a']} />).className
    expect(classes).toContain('focus:ring-border-strong/30')
    expect(classes).not.toContain('focus:ring-primary')
  })

  it('keeps the shape identical across tones — only the palette moves', () => {
    const shape = (tone: 'default' | 'active') =>
      el(<Select aria-label="Kind" tone={tone} options={['a']} />)
        .className.split(' ')
        .filter((c) => !/^(bg|border|text)-/.test(c) || c.includes(':'))
        .sort()
        .join(' ')
    expect(shape('active')).toBe(shape('default'))
  })

  it('the chevron follows the tone rather than staying quiet beside a tinted chip', () => {
    const quiet = mount(<Select aria-label="Kind" options={['a']} />).querySelector('svg')!
    const tinted = mount(<Select aria-label="Kind" tone="active" options={['a']} />).querySelector('svg')!
    expect(quiet.getAttribute('class')).toContain('text-subtle')
    expect(tinted.getAttribute('class')).toContain('text-primary-strong')
  })
})

describe('Select stays a real native select', () => {
  it('renders options, the selectable empty row and any children', () => {
    const c = mount(
      <Select aria-label="Kind" emptyLabel="Any" options={['one', { value: 2, label: 'two' }]}>
        <option value="3">three</option>
      </Select>,
    )
    expect([...c.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Any', 'one', 'two', 'three'])
  })

  it('the disabled state is the real attribute, not a no-op handler', () => {
    expect(el(<Select aria-label="Kind" options={['a']} disabled />).disabled).toBe(true)
  })

  it('the chevron is decorative and never swallows the click that opens the picker', () => {
    const svg = mount(<Select aria-label="Kind" options={['a']} />).querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toContain('pointer-events-none')
  })
})
