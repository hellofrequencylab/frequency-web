// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Switch } from './switch'

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


// Locks the Action-control state set from docs/INTERACTION-STATES.md §2 for the toggle the
// settings surfaces are built out of: rest, hover, pressed, focus-visible, optimistic-pending,
// disabled. The pending look is `.dimmed` (§4 rule 2) and it doubles as the double-fire guard
// (§4 rule 4) — never a spinner, which would change the control's width.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: Partial<React.ComponentProps<typeof Switch>> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <Switch checked={false} onCheckedChange={() => {}} aria-label="Notify me" {...props} />,
    ),
  )
  return container!.querySelector('button')!
}

describe('Switch rest + selected', () => {
  it('reports its state to assistive tech, not just in color', () => {
    expect(mount({ checked: true }).getAttribute('aria-checked')).toBe('true')
    expect(mount({ checked: false }).getAttribute('aria-checked')).toBe('false')
  })

  it('is primary when on and a neutral track when off', () => {
    expect(mount({ checked: true }).className).toContain('on'); expect(frequencyStyle('.sw.on','background','var(--fq-pa)')).toBe(true)
    expect(mount({ checked: false }).className).toBe('sw'); expect(frequencyStyle('.sw','background','var(--fq-track)')).toBe(true)
  })
})

describe('Switch hover', () => {
  it('has a hover step in BOTH positions, and they differ', () => {
    const on = mount({ checked: true }).className
    const off = mount({ checked: false }).className
    expect(on).toContain('on'); expect(frequencyStyle('button.sw[role="switch"].on:not(:disabled):not([aria-busy="true"]):hover','filter','brightness(1.08)')).toBe(true)
    expect(off).toBe('sw'); expect(frequencyStyle('button.sw[role="switch"]:not(:disabled):not([aria-busy="true"]):not(.on):hover','background')).toBe(true)
    expect(on).not.toBe(off)
  })

  it('does NOT light up under the pointer when it cannot be used', () => {
    expect(mount({ disabled: true }).className).not.toContain('hover:bg-')
    expect(mount({ pending: true }).className).not.toContain('hover:bg-')
    expect(frequencyStyle('button.sw[role="switch"][aria-busy="true"]','filter','none')).toBe(true)
    expect(frequencyStyle('button.sw[role="switch"]:disabled','transform','none')).toBe(true)
  })
})

describe('Switch pressed + focus', () => {
  it('uses `.press` and an explicit focus ring', () => {
    const el = mount()
    expect(el.className).toContain('sw'); expect(frequencyStyle('button.sw[role="switch"]:not(:disabled):not([aria-busy="true"]):active','transform','scale(.97)')).toBe(true)
    expect(el.className).toContain('sw'); expect(frequencyStyle('button.sw[role="switch"]:focus-visible','outline','2px solid var(--fq-focus-ring)')).toBe(true)
    expect(el.className).toContain('sw'); expect(frequencyStyle('button.sw[role="switch"]','transition','none','(prefers-reduced-motion:reduce)')).toBe(true)
    expect(frequencyStyle('button.sw[role="switch"]:not(:disabled):not([aria-busy="true"]):active','transform','none','(prefers-reduced-motion:reduce)')).toBe(true)
  })
})

describe('Switch disabled vs optimistic-pending', () => {
  it('disabled is unavailable: the flat fade, and the click is blocked', () => {
    const el = mount({ disabled: true })
    expect(el.disabled).toBe(true)
    expect(el.className).toContain('sw'); expect(frequencyStyle('.sw:disabled','opacity','.5')).toBe(true)
    expect(el.className).not.toContain('mu-pending'); expect(frequencyStyle('.sw.mu-pending','opacity','.6')).toBe(true)
    expect(el.getAttribute('aria-busy')).toBeNull()
  })

  it('pending is `.dimmed` + aria-busy — real but not settled, and not re-fireable', () => {
    const el = mount({ pending: true })
    expect(el.className).toContain('mu-pending'); expect(frequencyStyle('.sw.mu-pending','opacity','.6')).toBe(true)
    expect(el.className).toContain('sw'); expect(el.className).not.toContain('opacity-50')
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(el.disabled).toBe(true)
  })

  it('does not swap in a spinner (no layout shift while a write is in flight)', () => {
    const el = mount({ pending: true })
    expect(el.className).not.toContain('animate-spin')
    expect(el.querySelectorAll('svg').length).toBe(0)
  })

  it('is neither by default', () => {
    const el = mount()
    expect(el.disabled).toBe(false)
    expect(el.className).not.toContain('mu-pending'); expect(frequencyStyle('.sw.mu-pending','opacity','.6')).toBe(true)
    expect(el.className).toContain('sw'); expect(el.className).not.toContain('opacity-50')
  })
})
