// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Field, Input, Textarea, fieldClasses } from './field'

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
    expect(fieldClasses).toContain('border-border')
    expect(fieldClasses).toContain('focus:border-border-strong')
    expect(fieldClasses).toContain('aria-[invalid=true]:border-danger')
    expect(fieldClasses).toContain('disabled:opacity-50')
    expect(fieldClasses).toContain('disabled:cursor-not-allowed')
  })

  it('keeps the calm neutral focus halo, never the amber chrome ring', () => {
    expect(fieldClasses).toContain('focus:ring-border-strong/30')
    expect(fieldClasses).not.toContain('focus:ring-primary')
  })
})

describe('Input + Textarea error state', () => {
  it('an aria-invalid input carries the danger border classes', () => {
    const c = mount(<Input aria-invalid defaultValue="nope" />)
    const el = c.querySelector('input')!
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.className).toContain('aria-[invalid=true]:border-danger')
  })

  it('a valid input is not styled as an error', () => {
    const c = mount(<Input defaultValue="fine" />)
    expect(c.querySelector('input')!.getAttribute('aria-invalid')).toBeNull()
  })

  it('Textarea shares the same one source of truth', () => {
    const c = mount(<Textarea aria-invalid />)
    expect(c.querySelector('textarea')!.className).toContain('aria-[invalid=true]:border-danger')
  })
})

describe('Input disabled state', () => {
  it('is a real disabled attribute plus a legible fade', () => {
    const c = mount(<Input disabled />)
    const el = c.querySelector('input')!
    expect(el.disabled).toBe(true)
    expect(el.className).toContain('disabled:cursor-not-allowed')
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
    expect(live.querySelector('span')!.className).toContain('text-danger')
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
    expect(c.querySelector('.text-danger')).toBeNull()
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
