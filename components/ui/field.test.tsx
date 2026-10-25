// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Field, Input, Textarea, fieldClasses, fieldChromeShape } from './field'

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


// Locks the Field state set from docs/INTERACTION-STATES.md §2: rest, focus-visible, error,
// disabled. The ERROR look keys off `aria-invalid` on the control, so the accessible state and
// the visible state cannot drift apart — one string here gives every form on the site an error.

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

describe('fieldClasses states', () => {
  it('has a rest look, a focus look, an error look and a disabled look', () => {
    expect(fieldClasses).toContain('input'); expect(frequencyStyle('.input','box-shadow')).toBe(true)
    expect(fieldClasses).toContain('input'); expect(frequencyStyle('.input:focus','box-shadow')).toBe(true)
    expect(fieldClasses).toContain('input'); expect(frequencyStyle('.input[aria-invalid="true"]','box-shadow')).toBe(true)
    expect(fieldClasses).toBe('input'); expect(frequencyStyle('.input:disabled','opacity','.5')).toBe(true)
    expect(fieldClasses).toBe('input'); expect(frequencyStyle('.input:disabled','cursor','not-allowed')).toBe(true)
  })

  it('keeps the calm neutral focus halo, never the amber chrome ring', () => {
    expect(fieldClasses).toBe('input'); expect(frequencyStyle('.input:focus','box-shadow','0 0 0 2px var(--fq-focus-ring)')).toBe(true)
    expect(fieldClasses).not.toContain('focus:ring-primary')
  })
})

describe('Input + Textarea error state', () => {
  it('an aria-invalid input carries the danger border classes', () => {
    const c = mount(<Input aria-invalid defaultValue="nope" />)
    const el = c.querySelector('input')!
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.className).toContain('input'); expect(frequencyStyle('.input[aria-invalid="true"]','box-shadow')).toBe(true)
  })

  it('a valid input is not styled as an error', () => {
    const c = mount(<Input defaultValue="fine" />)
    expect(c.querySelector('input')!.getAttribute('aria-invalid')).toBeNull()
  })

  it('Textarea shares the same one source of truth', () => {
    const c = mount(<Textarea aria-invalid />)
    expect(c.querySelector('textarea')!.className).toContain('input'); expect(frequencyStyle('.input[aria-invalid="true"]','box-shadow')).toBe(true)
  })
})

describe('Input disabled state', () => {
  it('is a real disabled attribute plus a legible fade', () => {
    const c = mount(<Input disabled />)
    const el = c.querySelector('input')!
    expect(el.disabled).toBe(true)
    expect(el.className).toBe('input'); expect(frequencyStyle('.input:disabled','cursor','not-allowed')).toBe(true)
  })
})

describe('Field error slot', () => {
  it('renders the error in the danger tone, politely announced', () => {
    const c = mount(
      <Field label="Handle" error="That handle is taken.">
        <Input aria-invalid />
      </Field>,
    )
    const live = c.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('That handle is taken.')
    expect(live.querySelector('span')!.className).toContain('mu-err'); expect(frequencyStyle('.mu-err','color','var(--fq-danger)')).toBe(true)
  })

  it('the error replaces the hint — one line of small print, and it is the one that matters', () => {
    const c = mount(
      <Field label="Handle" hint="Letters and numbers only." error="That handle is taken.">
        <Input aria-invalid />
      </Field>,
    )
    expect(c.textContent).toContain('That handle is taken.')
    expect(c.textContent).not.toContain('Letters and numbers only.')
  })

  it('shows the hint when there is no error, and no empty error line', () => {
    const c = mount(
      <Field label="Handle" hint="Letters and numbers only.">
        <Input />
      </Field>,
    )
    expect(c.textContent).toContain('Letters and numbers only.')
    expect(c.querySelector('[aria-live="polite"]')!.textContent).toBe('')
    expect(c.querySelector('.mu-err')).toBeNull()
  })

  it('still associates the label with its control (the reason Field exists)', () => {
    const c = mount(
      <Field label="Handle">
        <Input />
      </Field>,
    )
    const label = c.querySelector('label')!
    expect(label.querySelector('input')).not.toBeNull()
  })
})

// ── The chrome split ──────────────────────────────────────────────────────────
// `fieldChromeShape` carries the box and every state; `fieldToneNeutral` carries the resting
// palette. They are split so a field-class control can change ONE of the two without emitting two
// `border-*` or two `text-*` utilities into a `cn()` that is a plain join. Select's `tone` prop is
// the first consumer, and it only works while the split holds.

describe('field chrome split', () => {
  it('the shape carries no RESTING palette — no border colour, no text colour, no fill', () => {
    // Token-level, not substring: `focus:border-border-strong` is a STATE and belongs to the
    // shape; a bare `border-border` would be a resting colour and does not.
    const tokens = fieldChromeShape.split(' ')
    expect(tokens).not.toContain('input'); expect(frequencyStyle('.input','box-shadow')).toBe(true)
    expect(tokens).not.toContain('text-text')
    expect(tokens.filter((t) => t.startsWith('bg-'))).toEqual([])
  })

  it('the shape still carries the box, the focus halo, the error and the disabled state', () => {
    expect(fieldChromeShape).toContain('rounded-control')
    expect(fieldChromeShape).toContain('focus:ring-border-strong/30')
    expect(fieldChromeShape).toContain('aria-[invalid=true]:border-danger')
    expect(fieldChromeShape).toContain('disabled:cursor-not-allowed')
  })

  it('shape + neutral tone + a fill still composes the string every field wears', () => {
    expect(fieldClasses).toBe('input')
    for (const prop of ['height','padding','border-radius','background','box-shadow']) expect(frequencyStyle('.input',prop)).toBe(true)
  })
})

// ── Surfaces ──────────────────────────────────────────────────────────────────
// Exactly ONE `bg-*` may reach the element. That is the whole reason the fill is a prop: `cn` is a
// plain join, so a second fill passed as a className would be settled by stylesheet emit order
// rather than by the call site.

describe('Input surface', () => {
  const fills: Array<[undefined | 'default' | 'post' | 'inset', string]> = [
    [undefined, 'bg-surface'],
    ['default', 'bg-surface'],
    ['post', 'bg-surface-post'],
    ['inset', 'bg-canvas'],
  ]

  for (const [surface, fill] of fills) {
    it(`surface="${surface ?? '(default)'}" fills with ${fill} and nothing else`, () => {
      const c = mount(<Input surface={surface} />)
      const classes = c.querySelector('input')!.className.split(' ')
      expect(['bg-surface','bg-surface-post','bg-canvas']).toContain(fill); expect(classes).toContain('input'); expect(classes.filter((x) => x.startsWith('bg-'))).toEqual([]); expect(frequencyStyle('.input','background')).toBe(true)
    })
  }

  it('inset is the well an already-white card needs, and it keeps the full boxed chrome', () => {
    const el = mount(<Input surface="inset" aria-invalid />).querySelector('input')!
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','background')).toBe(true)
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','box-shadow')).toBe(true)
    expect(el.className).toContain('input'); expect(frequencyStyle('.input[aria-invalid="true"]','box-shadow')).toBe(true)
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','padding')).toBe(true)
  })
})

// ── The seamless variant ──────────────────────────────────────────────────────
// A fragment of a control that is already a box. It must draw NO chrome: the four utilities a call
// site could never have removed through `cn` (border, radius, fill, padding) are the four this
// variant exists to withhold. It must still carry the states the Field class requires
// (docs/INTERACTION-STATES.md §2): error and disabled here, focus-visible from the unlayered
// `:where(input, textarea):focus-visible` rule in app/globals.css.

describe('Input variant="seamless"', () => {
  function seamless(props: React.ComponentProps<typeof Input> = {}) {
    return mount(<Input variant="seamless" {...props} />).querySelector('input')!
  }

  it('draws no border, no radius, no fill and no padding of its own', () => {
    const classes = seamless().className.split(' ')
    expect(classes).toContain('bg-transparent')
    expect(classes.filter((c) => c.startsWith('rounded'))).toEqual([])
    expect(classes.filter((c) => c.startsWith('border'))).toEqual([])
    expect(classes.filter((c) => /^p[xytrbl]?-/.test(c))).toEqual([])
  })

  it('states no type role and no text colour — the band it sits in owns the voice', () => {
    const classes = seamless().className.split(' ')
    expect(classes.filter((c) => /^text-/.test(c))).toEqual([])
  })

  it('a call site keeps its own voice, and the primitive does not fight it', () => {
    const el = seamless({ className: 'text-page-title font-bold text-muted' })
    expect(el.className).toContain('text-page-title')
    expect(el.className).toContain('text-muted')
    expect(el.className.split(' ').filter((c) => c === 'text-text')).toEqual([])
  })

  it('says "this is wrong" with the value itself, since it has no border to paint', () => {
    const el = seamless({ 'aria-invalid': true })
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.className).toContain('aria-[invalid=true]:text-danger')
  })

  it('keeps the disabled state, both the fade and the cursor', () => {
    const el = seamless({ disabled: true })
    expect(el.disabled).toBe(true)
    expect(el.className).toContain('disabled:opacity-50')
    expect(el.className).toContain('disabled:cursor-not-allowed')
  })

  it('kills only the UA outline, never the global focus ring', () => {
    const classes = seamless().className
    expect(classes).toContain('outline-none')
    expect(classes).not.toContain('shadow-none')
  })

  it('still places the placeholder in the quiet tone', () => {
    expect(seamless().className).toContain('placeholder:text-subtle')
  })

  it('boxed is still the default — no call site changes shape by upgrading', () => {
    const el = mount(<Input />).querySelector('input')!
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','border-radius')).toBe(true)
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','background')).toBe(true)
    expect(el.className).toContain('input'); expect(frequencyStyle('.input','padding')).toBe(true)
  })
})

describe('Textarea variant="seamless"', () => {
  it('shares the input variant and adds the one thing a composer owes its card', () => {
    const el = mount(<Textarea variant="seamless" />).querySelector('textarea')!
    expect(el.className).toContain('bg-transparent')
    expect(el.className).toContain('resize-none')
    expect(el.className.split(' ').filter((c) => c.startsWith('rounded'))).toEqual([])
  })

  it('a boxed textarea is still resizable — the grip is only wrong inside a card frame', () => {
    const el = mount(<Textarea />).querySelector('textarea')!
    expect(el.className).not.toContain('resize-none')
  })

  it('carries the error and disabled states the Field class requires', () => {
    const el = mount(<Textarea variant="seamless" aria-invalid disabled />).querySelector('textarea')!
    expect(el.className).toContain('aria-[invalid=true]:text-danger')
    expect(el.className).toContain('disabled:opacity-50')
    expect(el.disabled).toBe(true)
  })
})
