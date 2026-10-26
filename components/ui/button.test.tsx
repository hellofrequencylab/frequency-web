// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Button, buttonClasses } from './button'

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


// Locks the Action-control state set from docs/INTERACTION-STATES.md §2: rest, hover,
// pressed, focus-visible, loading, disabled. Button is the highest-reach control in the
// app (~40 files used to hand-roll it), so a state that regresses here regresses everywhere.

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

function btn(c: HTMLElement) {
  return c.querySelector('button')!
}

describe('Button rest + hover', () => {
  it('renders the variant tokens at rest and a hover step for each variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      expect(buttonClasses(variant)).toContain('btn'); expect(frequencyStyle('.btn:hover','transform','translateY(-1px)')).toBe(true)
    }
  })
})

describe('Button pressed', () => {
  it('carries `.press` — the ONE sanctioned pressed state, not a bespoke scale', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).className).toContain('btn'); expect(frequencyStyle('.btn:active','transform','scale(.97)')).toBe(true)
    // The press must be able to ease, so `transform` is in the transition property list.
    expect(btn(c).className).toContain('btn'); expect(frequencyStyle('.btn','transition')).toBe(true)
  })

  it('collapses its transition under prefers-reduced-motion', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).className).toContain('btn'); expect(frequencyStyle(':root[data-design="frequency"]','--fq-dur-base','0ms','(prefers-reduced-motion:reduce)')).toBe(true)
  })
})

describe('Button disabled', () => {
  it('is a real `disabled` attribute, not a no-op handler, and reads as unavailable', () => {
    const c = mount(<Button disabled>Save</Button>)
    expect(btn(c).disabled).toBe(true)
    expect(btn(c).className).toContain('btn'); expect(frequencyStyle('.btn:disabled','opacity','.4')).toBe(true)
    expect(btn(c).className).toContain('btn'); expect(frequencyStyle('.btn:disabled','cursor','not-allowed')).toBe(true)
  })
})

describe('Button loading', () => {
  it('marks itself busy and blocks the double-fire', () => {
    const c = mount(<Button loading>Save</Button>)
    expect(btn(c).getAttribute('aria-busy')).toBe('true')
    expect(btn(c).disabled).toBe(true)
  })

  it('leaves the LABEL alone, so the control cannot change width mid-flight', () => {
    const c = mount(<Button loading>Save changes</Button>)
    expect(btn(c).textContent).toBe('Save changes')
    expect(btn(c).textContent).not.toContain('…')
  })

  it('is absent by default — a plain button is never busy', () => {
    const c = mount(<Button>Save</Button>)
    expect(btn(c).getAttribute('aria-busy')).toBeNull()
    expect(btn(c).disabled).toBe(false)
  })

  it('guards an asChild link too, which has no `disabled` attribute', () => {
    const c = mount(
      <Button asChild loading>
        {/* A BARE `<a>` IS THE POINT OF THIS TEST, so it is not a `<Link>`. The assertion is that
            `asChild` guards a child that has no `disabled` attribute, which is the anchor branch of
            `buttonClasses`; swapping in `next/link` would test Link's prop forwarding instead, and
            would need a router context this jsdom `createRoot` mount does not have. `/somewhere` is
            a placeholder that only looks like a route to the lint rule because
            `app/(main)/@wizard/[...catchAll]` makes every one-segment path resolve as a page. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/somewhere">Go</a>
      </Button>,
    )
    const a = c.querySelector('a')!
    expect(a.getAttribute('aria-busy')).toBe('true')
    expect(a.getAttribute('aria-disabled')).toBe('true')
    expect(a.className).toContain('pointer-events-none')
  })
})
