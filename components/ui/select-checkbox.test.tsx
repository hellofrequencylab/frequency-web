// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Select, selectClasses } from './select'
import { Checkbox, checkboxClasses } from './checkbox'
import { Field, fieldChromeClasses, fieldClasses } from './field'

// Locks the two primitives that replace the largest un-primitived controls in the product
// (~267 raw <select> elements and the raw checkbox inputs beside them). What is worth locking is
// not the look but the CONTRACT the sweep depends on:
//   · a real native control stays underneath — keyboard, label association and form wiring
//     come from the browser, so nothing has to be re-implemented per call site;
//   · the SPLIT focus treatment holds — a select is a field (calm neutral halo), a checkbox is
//     actionable chrome (the global 3px amber ring). Two treatments, never a third;
//   · the token rules the CI gates enforce (role radius, role type, no raw palette).

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

describe('Select is a native <select>', () => {
  it('renders a real select, not a div-based listbox', () => {
    const c = mount(<Select options={['Mind', 'Body']} />)
    expect(c.querySelector('select')).not.toBeNull()
    expect(c.querySelector('[role="listbox"]')).toBeNull()
  })

  it('accepts string options and value/label pairs, and marks a disabled option', () => {
    const c = mount(
      <Select
        options={['Mind', { value: 'near', label: 'Near you' }, { value: 'x', label: 'Soon', disabled: true }]}
        defaultValue="Mind"
      />,
    )
    const options = Array.from(c.querySelectorAll('option'))
    expect(options.map((o) => o.value)).toEqual(['Mind', 'near', 'x'])
    expect(options.map((o) => o.textContent)).toEqual(['Mind', 'Near you', 'Soon'])
    expect(options[2].disabled).toBe(true)
  })

  it('emptyLabel renders a leading, SELECTABLE value="" option (clearing a filter is a choice)', () => {
    const c = mount(<Select emptyLabel="Any" options={['Mind']} defaultValue="" />)
    const first = c.querySelectorAll('option')[0]
    expect(first.value).toBe('')
    expect(first.textContent).toBe('Any')
    expect(first.disabled).toBe(false)
  })

  it('still takes children, so <optgroup> and per-option markup keep working', () => {
    const c = mount(
      <Select emptyLabel="Any">
        <optgroup label="Channels">
          <option value="mind">Mind</option>
        </optgroup>
      </Select>,
    )
    expect(c.querySelector('optgroup')?.label).toBe('Channels')
    expect(c.querySelectorAll('option')).toHaveLength(2)
  })

  it('forwards native select props — name, required, disabled, value', () => {
    const c = mount(<Select name="channel" required disabled options={['Mind']} defaultValue="Mind" />)
    const el = c.querySelector('select')!
    expect(el.name).toBe('channel')
    expect(el.required).toBe(true)
    expect(el.disabled).toBe(true)
    expect(el.value).toBe('Mind')
  })

  it('is labelled by a wrapping Field — the wrapper span does not break implicit association', () => {
    const c = mount(
      <Field label="Channel">
        <Select options={['Mind']} />
      </Field>,
    )
    const label = c.querySelector('label')!
    expect(label.querySelector('select')).not.toBeNull()
    expect((label as HTMLLabelElement).control?.tagName).toBe('SELECT')
  })

  it('the chevron is decorative and never eats the click that opens the picker', () => {
    const c = mount(<Select options={['Mind']} />)
    const svg = c.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toContain('pointer-events-none')
  })
})

describe('Select chrome', () => {
  it('wears the shared field chrome, so it can never drift from Input', () => {
    expect(selectClasses).toContain(fieldChromeClasses)
    expect(fieldClasses).toContain(fieldChromeClasses)
  })

  it('keeps the CALM NEUTRAL field halo on focus — a form must not glow orange', () => {
    expect(selectClasses).toContain('focus:ring-border-strong/30')
    expect(selectClasses).not.toContain('ring-primary')
  })

  it('owns its padding so the chevron gutter cannot collide with the chrome string', () => {
    expect(selectClasses).toContain('pr-9')
    expect(fieldChromeClasses).not.toContain('px-3')
  })

  it('takes the role radius and the per-generation tap floor', () => {
    expect(selectClasses).toContain('rounded-control')
    expect(selectClasses).toContain('tap-target')
  })

  it('keeps the error look keyed off aria-invalid, like every other field', () => {
    const c = mount(<Select aria-invalid options={['Mind']} />)
    const el = c.querySelector('select')!
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.className).toContain('aria-[invalid=true]:border-danger')
  })
})

describe('Checkbox is a native input', () => {
  it('renders a real checkbox input, not a button with role="checkbox"', () => {
    const c = mount(<Checkbox label="I agree" defaultChecked />)
    const el = c.querySelector('input')!
    expect(el.type).toBe('checkbox')
    expect(el.checked).toBe(true)
    expect(c.querySelector('[role="checkbox"]')).toBeNull()
    expect(c.querySelector('button')).toBeNull()
  })

  it('associates its label implicitly — clicking the text toggles the box', () => {
    const c = mount(<Checkbox label="I agree" />)
    const label = c.querySelector('label')! as HTMLLabelElement
    expect(label.control?.getAttribute('type')).toBe('checkbox')
    expect(label.textContent).toContain('I agree')
    act(() => {
      label.click()
    })
    expect(c.querySelector('input')!.checked).toBe(true)
  })

  it('is controlled the native way — checked + onChange(event)', () => {
    const seen: boolean[] = []
    const c = mount(<Checkbox label="I agree" checked={false} onChange={(e) => seen.push(e.target.checked)} />)
    act(() => {
      c.querySelector('input')!.click()
    })
    expect(seen).toEqual([true])
    // Controlled: the DOM does not drift ahead of the caller's state.
    expect(c.querySelector('input')!.checked).toBe(false)
  })

  it('forwards name, value and required so it submits inside a plain <form>', () => {
    const c = mount(<Checkbox label="Marketing email" name="consent" value="email_marketing" required />)
    const el = c.querySelector('input')!
    expect(el.name).toBe('consent')
    expect(el.value).toBe('email_marketing')
    expect(el.required).toBe(true)
  })

  it('disabled is a real attribute, and the fade is applied once, not compounded', () => {
    const c = mount(<Checkbox label="Locked" hint="Ask an operator." disabled />)
    expect(c.querySelector('input')!.disabled).toBe(true)
    expect(c.querySelector('label')!.className).toContain('cursor-not-allowed')
    // The box fades via `disabled:` on the input; only the TEXT takes a wrapper opacity.
    expect(c.querySelector('label')!.className).not.toContain('opacity-50')
    expect(checkboxClasses).toContain('disabled:opacity-50')
  })

  it('renders the hint under the label, and nothing when there is none', () => {
    const withHint = mount(<Checkbox label="Marketing email" hint="Occasional news." />)
    expect(withHint.textContent).toContain('Occasional news.')
    act(() => root!.unmount())
    container!.remove()
    const plain = mount(<Checkbox label="Marketing email" />)
    expect(plain.textContent).toBe('Marketing email')
  })

  // The tap floor must NEVER land on this input. `checkboxClasses` is `appearance-none` with its
  // own border and fill, so the input IS the visible box — a min-block-size floor there does not
  // grow a hit area, it grows the checkbox itself: 44px on a coarse pointer and up to 56px on the
  // kids generations, with the tick still frozen at 12px. The floor belongs on a wrapper.
  it('unlabelled puts the tap floor on a bare wrapper, never on the box itself', () => {
    const c = mount(<Checkbox aria-label="Select row" />)
    const el = c.querySelector('input')!
    expect(el.getAttribute('aria-label')).toBe('Select row')
    expect(el.className).not.toContain('tap-target')
    // A textless <label> — it names nothing (aria-label does that) and exists only to be the
    // clickable floor, which a <span> could not be.
    const wrapper = c.querySelector('label')!
    expect(wrapper).not.toBeNull()
    expect(wrapper.className).toContain('tap-target')
    expect(wrapper.textContent).toBe('')
  })

  it('keeps the visible box at its intended size in both branches', () => {
    for (const node of [mount(<Checkbox aria-label="x" />), mount(<Checkbox label="y" />)]) {
      expect(node.querySelector('input')!.className).toContain('size-5')
      expect(node.querySelector('input')!.className).not.toContain('tap-target')
    }
  })

  it('labelled puts the tap floor on the label, so the box stays trim beside the text', () => {
    const c = mount(<Checkbox label="I agree" />)
    expect(c.querySelector('label')!.className).toContain('tap-target')
    expect(c.querySelector('input')!.className).not.toContain('tap-target')
  })
})

describe('Checkbox chrome', () => {
  it('is actionable chrome: it defers to the global amber ring, never the field halo', () => {
    expect(checkboxClasses).not.toContain('ring-border-strong')
    expect(checkboxClasses).not.toContain('ring-primary')
    expect(checkboxClasses).not.toContain('focus')
  })

  it('takes the role radius and the amber checked fill from tokens', () => {
    expect(checkboxClasses).toContain('rounded-control')
    expect(checkboxClasses).toContain('checked:bg-primary')
    expect(checkboxClasses).toContain('checked:border-primary')
  })

  it('honours prefers-reduced-motion on both the fill and the check', () => {
    expect(checkboxClasses).toContain('motion-reduce:transition-none')
    const c = mount(<Checkbox label="I agree" />)
    expect(c.querySelector('svg')!.getAttribute('class')).toContain('motion-reduce:transition-none')
  })

  it('the check mark is decorative and driven by :checked, with no JS mirror', () => {
    const c = mount(<Checkbox label="I agree" />)
    const svg = c.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toContain('peer-checked:opacity-100')
    expect(c.querySelector('input')!.className).toContain('peer')
  })

  it('shows the error border from aria-invalid, like every other control', () => {
    const c = mount(<Checkbox label="Accept the terms" aria-invalid />)
    expect(c.querySelector('input')!.className).toContain('aria-[invalid=true]:border-danger')
  })
})

// The three shapes the raw controls actually take in this repo. If the primitives cannot absorb
// these without a per-site rewrite, the sweep stalls — so they are pinned here.
describe('the shapes found in the wild convert without rewriting the call site', () => {
  it('label-to-the-right settings row (the admin module shape)', () => {
    const c = mount(
      <Checkbox
        label="List this on the market"
        checked
        onChange={() => {}}
        wrapperClassName="pt-1"
      />,
    )
    expect(c.querySelector('label')!.className).toContain('pt-1')
    expect(c.querySelector('input')!.checked).toBe(true)
  })

  it('label-to-the-LEFT row — layout goes to wrapperClassName, the input keeps className', () => {
    const c = mount(
      <Checkbox
        label="Show the cover band"
        wrapperClassName="w-full flex-row-reverse justify-between"
        className="mt-0.5"
      />,
    )
    expect(c.querySelector('label')!.className).toContain('flex-row-reverse')
    expect(c.querySelector('input')!.className).toContain('mt-0.5')
  })

  it('bare grid-cell checkbox named only by aria-label (the function-grid shape)', () => {
    const c = mount(<Checkbox aria-label="Bookings: enabled" checked disabled onChange={() => {}} />)
    const el = c.querySelector('input')!
    expect(el.getAttribute('aria-label')).toBe('Bookings: enabled')
    expect(el.disabled).toBe(true)
  })

  it('inline toolbar select shrinks to its options via wrapperClassName', () => {
    const c = mount(
      <Select
        wrapperClassName="inline-block w-max max-w-full"
        options={['Newest', 'Near you']}
        defaultValue="Newest"
      />,
    )
    const wrapper = c.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('w-max')
    expect(wrapper.className).toContain('relative')
    // The base `w-full` is STILL in the attribute — `cn()` joins, it does not merge — so this
    // assertion alone proves nothing about width. What settles it is emit order, pinned below.
    expect(wrapper.className).toContain('w-full')
  })

  // 🔴 The assertion above used to read `toContain('w-auto')` and was green for months while the
  // control it described stayed full width. `cn()` is a plain join, so BOTH classes reach the
  // attribute and the compiled sheet decides — and `.w-auto` is emitted BEFORE `.w-full`, so the
  // override lost. A test that greps the string it was handed can never catch that; it has to ask
  // the compiler. This does, against the real globals.css, the same way check-phantom-classes does.
  it('the recommended width override actually beats the base w-full in the cascade', async () => {
    const { compile } = await import('tailwindcss')
    const { readFileSync } = await import('node:fs')
    const { resolve, join, dirname } = await import('node:path')
    const compiler = await compile(readFileSync('app/globals.css', 'utf8'), {
      base: process.cwd(),
      loadStylesheet: async (id: string, base: string) => {
        const target = id.startsWith('.') ? resolve(base, id) : resolve('node_modules', id)
        const p = target.endsWith('.css') ? target : join(target, 'index.css')
        return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') }
      },
    })
    const out = compiler.build(['w-full', 'w-auto', 'w-max', 'block', 'inline-block'])
    const at = (c: string) => out.indexOf(c)
    // Later wins. w-max must follow w-full, or the docstring is lying again.
    expect(at('.w-max')).toBeGreaterThan(at('.w-full'))
    // And the reason w-auto was wrong, kept as a live fact rather than a comment.
    expect(at('.w-auto')).toBeLessThan(at('.w-full'))
    // The display half of the recommendation was always sound.
    expect(at('.inline-block')).toBeGreaterThan(at('.block'))
  })
})

describe('both primitives obey the token gates', () => {
  const strings = { selectClasses, checkboxClasses }
  for (const [name, value] of Object.entries(strings)) {
    it(`${name}: no literal radius, no literal type size, no raw palette, no hex`, () => {
      expect(value).not.toMatch(/\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/)
      expect(value).not.toMatch(/\btext-(?:xs|sm|base|lg|xl|2xl)\b/)
      expect(value).not.toMatch(/text-\[\d+px\]/)
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(value).not.toMatch(/-(?:slate|gray|zinc|neutral|amber|orange)-\d{2,3}\b/)
    })
  }
})
