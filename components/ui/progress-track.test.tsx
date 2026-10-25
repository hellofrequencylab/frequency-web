// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProgressTrack } from './progress-track'

vi.mock('@/lib/theme/design', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/theme/design')>(), SITE_DESIGN: 'frequency',
}))
import {readFileSync as readFrequencyCss} from 'node:fs'
import {createRequire as frequencyRequire} from 'node:module'
const frequencyPostcss = frequencyRequire(frequencyRequire(import.meta.url).resolve('@tailwindcss/postcss'))('postcss')
const frequencyRules: {selector: string; nodes: {type: string; prop?: string; value?: string}[]; parent: {type: string; params?: string}}[] = []
for (const file of ['kit-members','members-ui','core']) frequencyPostcss.parse(readFrequencyCss(`app/themes/frequency/${file}.css`,'utf8')).walkRules((rule: typeof frequencyRules[number])=>frequencyRules.push(rule))
function frequencyStyle(selector: string, prop: string | RegExp, value?: string, media?: string) {
  return frequencyRules.some(rule=>rule.selector.includes(selector) && (!media || (rule.parent.type==='atrule' && rule.parent.params===media)) && rule.nodes.some(node=>node.type==='decl' && (typeof prop === 'string' ? node.prop===prop : prop.test(node.prop ?? '')) && (value===undefined || node.value===value)))
}


// Locks the generic progress primitive (DAWN 2026-08-03 §5): clamped 0-100,
// accessible progressbar, one FIXED tone per bar (no threshold color shifts —
// that law belongs to Meter, the freemium cap meter).

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: React.ComponentProps<typeof ProgressTrack>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<ProgressTrack {...props} />))
  return container!
}

function fill(c: HTMLElement) {
  return c.querySelector('[role="progressbar"].meter > i') as HTMLElement
}

describe('ProgressTrack clamping', () => {
  it('renders the value as the fill width', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    expect(fill(c).style.width).toBe('62%')
  })

  it('clamps values above 100', () => {
    const c = mount({ value: 140, label: 'Overflow' })
    expect(fill(c).style.width).toBe('100%')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
  })

  it('clamps negative values to 0', () => {
    const c = mount({ value: -5, label: 'Underflow' })
    expect(fill(c).style.width).toBe('0%')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0')
  })
})

describe('ProgressTrack accessibility', () => {
  it('exposes an accessible progressbar with min/max/now and the label as its name', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    const bar = c.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuenow')).toBe('62')
    expect(bar.getAttribute('aria-label')).toBe('Journey progress')
  })

  it('bakes in no percentage text (callers compose their own labels)', () => {
    const c = mount({ value: 62, label: 'Journey progress' })
    expect(c.textContent).toBe('')
  })
})

describe('ProgressTrack tones', () => {
  it('defaults to the primary tone', () => {
    const c = mount({ value: 50, label: 'Default' })
    expect(track(c).className).toContain('meter')
  })

  it('renders the success and move tones, fixed regardless of value', () => {
    const success = mount({ value: 95, label: 'Nearly there', tone: 'success' })
    expect(track(success).className).toContain('mu-success'); expect(frequencyStyle('.meter.mu-success i','background','var(--fq-success)')).toBe(true)
    act(() => root!.unmount())
    container!.remove()
    root = null
    container = null

    const move = mount({ value: 95, label: 'Get Moving', tone: 'move' })
    expect(track(move).className).toContain('mu-move'); expect(frequencyStyle('.meter.mu-move i','background','var(--fq-accent-2)')).toBe(true)
    // No threshold shift: high value never turns warning/danger here.
    expect(track(move).className).not.toContain('warning')
    expect(track(move).className).not.toContain('danger')
  })

  it('supports the compact size', () => {
    const c = mount({ value: 30, label: 'Compact', size: 'sm' })
    expect((c.querySelector('[role="progressbar"]') as HTMLElement).className).toContain('meter'); expect(frequencyStyle('.meter','height','4px')).toBe(true)
  })
})

// ── The generalizations the 2026-08-04 adoption sweep needed. Each was measured
// off a real ad-hoc bar the sweep retired; nothing here is speculative API.

function track(c: HTMLElement) {
  return c.querySelector('[role="progressbar"]') as HTMLElement
}

describe('ProgressTrack scale', () => {
  it('measures value against max and reports aria on that scale', () => {
    const c = mount({ value: 9, max: 30, label: '9 of 30 practice days logged' })
    expect(fill(c).style.width).toBe('30%')
    expect(track(c).getAttribute('aria-valuemax')).toBe('30')
    expect(track(c).getAttribute('aria-valuenow')).toBe('9')
  })

  it('clamps to max rather than to 100 when a scale is given', () => {
    const c = mount({ value: 44, max: 30, label: 'Overflow' })
    expect(fill(c).style.width).toBe('100%')
    expect(track(c).getAttribute('aria-valuenow')).toBe('30')
  })

  it('floors a started bar at minVisible so it still reads as a bar', () => {
    const c = mount({ value: 0.4, label: 'Barely started', minVisible: 6 })
    expect(fill(c).style.width).toBe('6%')
  })

  it('leaves a zero bar empty even with minVisible', () => {
    const c = mount({ value: 0, label: 'Not started', minVisible: 6 })
    expect(fill(c).style.width).toBe('0%')
  })
})

describe('ProgressTrack surface options', () => {
  it('renders the added sizes', () => {
    for (const [size, h] of [['lg', 'mu-h8'], ['xl', 'mu-h10'], ['2xl', 'mu-h12']] as const) {
      const c = mount({ value: 50, label: size, size })
      expect(track(c).className).toContain(h)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })

  it('renders the added tones and track colours', () => {
    const c = mount({ value: 50, label: 'Broadcast', tone: 'broadcast', track: 'broadcast' })
    expect(track(c).className).toContain('mu-broadcast'); expect(frequencyStyle('.meter.mu-broadcast i','background','var(--fq-live)')).toBe(true)
    expect(track(c).className).toContain('mu-track-broadcast'); expect(frequencyStyle('.meter.mu-track-broadcast','--fq-track','var(--fq-live-soft)')).toBe(true)
  })

  it('takes layout-only classes without losing its own', () => {
    const c = mount({ value: 50, label: 'Inline', className: 'flex-1 mt-1' })
    expect(track(c).className).toContain('flex-1')
    expect(track(c).className).toContain('meter'); expect(frequencyStyle('.meter',/^border-radius$/)).toBe(true)
  })

  it('opts into an eased fill only when asked', () => {
    const plain = mount({ value: 50, label: 'Plain' })
    expect(track(plain).className).not.toContain('mu-ease')
    act(() => root!.unmount())
    container!.remove()
    root = null
    container = null

    const eased = mount({ value: 50, label: 'Eased', animate: true })
    expect(track(eased).className).toContain('mu-ease'); expect(frequencyStyle('.meter.mu-ease i','transition','width 500ms var(--fq-ease-out)')).toBe(true)
    expect(track(eased).className).toContain('mu-ease'); expect(frequencyStyle('.meter.mu-ease i','transition','none','(prefers-reduced-motion:reduce)')).toBe(true)
  })
})

describe('ProgressTrack indeterminate', () => {
  it('drops aria-valuenow/max so assistive tech reads it as unknown progress', () => {
    const c = mount({ label: 'Importing contacts', indeterminate: true })
    expect(track(c).getAttribute('aria-valuenow')).toBeNull()
    expect(track(c).getAttribute('aria-valuemax')).toBeNull()
    expect(track(c).getAttribute('aria-valuemin')).toBe('0')
    expect(track(c).getAttribute('aria-label')).toBe('Importing contacts')
  })

  it('renders no inline width, and its motion is reduced-motion gated', () => {
    const c = mount({ label: 'Importing contacts', indeterminate: true })
    expect(fill(c).style.width).toBe('')
    expect(fill(c).className).toContain('motion-safe:animate-pulse')
  })
})

// Every public track option must affect the actual Frequency track, without altering fill or ARIA.
describe('Frequency ProgressTrack options',()=>{
  it.each([['elevated','','var(--fq-track)'],['surface','mu-track-surface','var(--fq-surface-card)'],['broadcast','mu-track-broadcast','var(--fq-live-soft)'],['border','mu-track-border','color-mix(in oklab,var(--fq-border-hair) 60%,transparent)']] as const)('%s retains its track paint',(option,marker,paint)=>{
    const c=mount({value:25,label:'Upload',track:option})
    expect(track(c).className).toContain(marker || 'meter')
    expect(frequencyStyle(marker?`.meter.${marker}`:'.meter',marker?'--fq-track':'background',paint)).toBe(true)
    expect(fill(c).style.width).toBe('25%')
    expect(track(c).getAttribute('aria-valuenow')).toBe('25')
  })
})
