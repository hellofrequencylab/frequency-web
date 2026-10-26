// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Meter } from './meter'

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


// Locks the freemium meter contract (DAWN 2026-08-03 §5; BRIEF-06 §3): teal with
// room, amber from 80%, danger ONLY at the cap — and NEVER a lock icon, because
// a cap is a fact about the plan, not a punishment.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: { used: number; cap: number; label: string; unit?: string }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<Meter {...props} />))
  return container!
}

function fill(c: HTMLElement) {
  return c.querySelector('[role="progressbar"] .meter > i') as HTMLElement
}

describe('Meter color states', () => {
  it('is success teal with comfortable room (< 80%)', () => {
    const c = mount({ used: 120, cap: 200, label: 'Contacts' })
    expect(c.querySelector('.meter')!.className).toBe('meter block')
    expect(c.querySelector('.meter')!.className).not.toContain('mu-warning')
    expect(c.querySelector('.meter')!.className).not.toContain('mu-danger')
  })

  it('turns warning amber from 80% of the cap', () => {
    const c = mount({ used: 240, cap: 300, label: 'Sends', unit: 'this month' })
    expect(c.querySelector('.meter')!.className).toContain('mu-warning'); expect(frequencyStyle('.meter.mu-warning i','background','var(--fq-warning)')).toBe(true)
    expect(c.querySelector('.meter')!.className).not.toContain('mu-danger')
  })

  it('stays amber just under the cap — danger is reserved for the cap itself', () => {
    const c = mount({ used: 299, cap: 300, label: 'Sends' })
    expect(c.querySelector('.meter')!.className).toContain('mu-warning'); expect(frequencyStyle('.meter.mu-warning i','background','var(--fq-warning)')).toBe(true)
    expect(c.querySelector('.meter')!.className).not.toContain('mu-danger')
  })

  it('is danger ONLY at the cap (100%)', () => {
    const c = mount({ used: 300, cap: 300, label: 'Sends' })
    expect(c.querySelector('.meter')!.className).toContain('mu-danger'); expect(frequencyStyle('.meter.mu-danger i','background','var(--fq-danger)')).toBe(true)
  })
})

describe('Meter never shows a lock', () => {
  it('renders no lock icon (and no icon at all) even at the cap', () => {
    const c = mount({ used: 3, cap: 3, label: 'QR codes' })
    expect(c.querySelector('svg')).toBeNull()
    expect(c.querySelector('.lucide-lock')).toBeNull()
  })
})

describe('Meter accessibility + reading', () => {
  it('exposes an accessible progressbar with min/max/now and a readable label', () => {
    const c = mount({ used: 241, cap: 300, label: 'Sends', unit: 'this month' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('300')
    expect(bar.getAttribute('aria-valuenow')).toBe('241')
    expect(bar.getAttribute('aria-label')).toBe('Sends: 241 of 300 this month')
  })

  it('clamps overflow to the cap (width and aria never exceed 100%)', () => {
    const c = mount({ used: 350, cap: 300, label: 'Sends' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('300')
    expect(fill(c).style.width).toBe('100%')
    // The visible reading still tells the truth about usage.
    expect(c.textContent).toContain('350 of 300')
  })
})
