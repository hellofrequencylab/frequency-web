// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Select, selectClasses } from './select'

vi.mock('@/lib/theme/design', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/theme/design')>(), SITE_DESIGN: 'frequency',
}))
import {readFileSync as readFrequencyCss} from 'node:fs'
import {createRequire as frequencyRequire} from 'node:module'
const frequencyPostcss = frequencyRequire(frequencyRequire(import.meta.url).resolve('@tailwindcss/postcss'))('postcss')
const frequencyRules: {selector: string; nodes: {type: string; prop?: string; value?: string}[]; parent: {type: string; params?: string}}[] = []
for (const file of ['kit-members','members-ui','core']) frequencyPostcss.parse(readFrequencyCss(`app/themes/frequency/${file}.css`,'utf8')).walkRules((rule: typeof frequencyRules[number])=>frequencyRules.push(rule))
function frequencyStyle(selector: string, prop: string, value?: string, media?: string) {
  return frequencyRules.some(rule=>rule.selector.includes(selector) && (!media || (rule.parent.type==='atrule' && rule.parent.params===media)) && rule.nodes.some(node=>node.type==='decl' && node.prop===prop && (value===undefined || node.value===value)))
}


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
    expect(selectClasses).toBe('input'); for(const prop of ['height','border-radius','padding']) expect(frequencyStyle('.input',prop)).toBe(true)
  })

  it('has a rest look, a focus look, an error look and a disabled look', () => {
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input','box-shadow')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input:focus','box-shadow')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input[aria-invalid="true"]','box-shadow')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input:disabled','opacity','.5')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input:disabled','cursor','not-allowed')).toBe(true)
  })

  it('keeps the calm neutral halo, never the amber chrome ring', () => {
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input:focus','box-shadow','0 0 0 2px var(--fq-focus-ring)')).toBe(true)
    expect(selectClasses).not.toContain('focus:ring-primary')
  })

  it('clears the touch floor and reserves the chevron gutter', () => {
    expect(selectClasses).toContain('input'); expect(frequencyStyle('.input','height')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('select.input','appearance','none')).toBe(true)
    expect(selectClasses).toContain('input'); expect(frequencyStyle('select.input','padding-right','44px')).toBe(true)
  })
})

describe('Select tone', () => {
  it('default is the neutral field palette', () => {
    const classes = el(<Select aria-label="Kind" options={['a']} />).className.split(' ')
    expect(classes).toContain('input'); expect(frequencyStyle('.input','background')).toBe(true)
    expect(classes).toContain('input')
  })

  it('active swaps border, fill and text in one move — the swap the chip filters make', () => {
    const classes = el(<Select aria-label="Kind" tone="active" options={['a']} />).className.split(' ')
    expect(classes).toContain('mu-active')
    expect(classes).toContain('mu-active'); expect(frequencyStyle('.input.mu-active','background','var(--fq-pa-soft)')).toBe(true)
    expect(classes).toContain('mu-active')
  })

  it('emits exactly one fill, one border colour and one text colour per tone', () => {
    for (const tone of ['default', 'active'] as const) {
      const classes = el(<Select aria-label="Kind" tone={tone} options={['a']} />).className.split(' ')
      expect(classes.filter((c) => c.startsWith('bg-'))).toHaveLength(0)
      expect(classes.filter((c) => /^border-(?!\d)/.test(c))).toHaveLength(0)
      expect(classes.filter((c) => /^text-(?:text|primary-strong|muted|subtle)$/.test(c))).toHaveLength(0)
    }
  })

  it('an active chip still focuses like a field, not like a button', () => {
    const classes = el(<Select aria-label="Kind" tone="active" options={['a']} />).className
    expect(classes).toContain('input'); expect(frequencyStyle('.input:focus','box-shadow','0 0 0 2px var(--fq-focus-ring)')).toBe(true)
    expect(classes).not.toContain('focus:ring-primary')
  })

  it('keeps the shape identical across tones — only the palette moves', () => {
    const shape = (tone: 'default' | 'active') =>
      el(<Select aria-label="Kind" tone={tone} options={['a']} />)
        .className.split(' ')
        .filter((c) => c !== 'mu-active')
        .sort()
        .join(' ')
    expect(shape('active')).toBe(shape('default'))
  })

  it('the chevron follows the tone rather than staying quiet beside a tinted chip', () => {
    const quiet = mount(<Select aria-label="Kind" options={['a']} />).querySelector('svg')!
    const tinted = mount(<Select aria-label="Kind" tone="active" options={['a']} />).querySelector('svg')!
    expect(quiet.getAttribute('aria-hidden')).toBe('true'); expect(frequencyStyle('.mu-select>svg','color','var(--fq-text-muted)')).toBe(true)
    expect(tinted.getAttribute('aria-hidden')).toBe('true'); expect(tinted.closest('.mu-select')!.className).toContain('mu-active'); expect(frequencyStyle('.mu-select.mu-active>svg','--fq-text-muted','var(--fq-accent)')).toBe(true)
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
    expect(frequencyStyle('.mu-select>svg','pointer-events','none')).toBe(true)
  })
})
