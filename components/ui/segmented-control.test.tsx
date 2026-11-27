// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SegmentedControl, SegmentedLinks } from './segmented-control'

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


vi.mock('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// The kit's segmented box (HYG-105): one bordered box, the options as segments inside it, the
// selected segment filled. Two forms, one look: aria-pressed buttons for an in-page state switch,
// aria-current links for navigation. The last block is the ratchet's promise: no raw <button>
// at a converted site carries `bg-primary` in its opening tag, and neither does the primitive,
// so the adoption ratchet (`raw-button-bg`) cannot count the fix as the bug.

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

const VIEWS = [
  { value: 'admin', label: 'Calendar' },
  { value: 'list', label: 'List' },
  { value: 'workflow', label: 'Workflow' },
] as const

describe('SegmentedControl (buttons)', () => {
  it('is one named group of plain buttons, the selected one pressed and filled', () => {
    const el = mount(<SegmentedControl label="Calendar views" value="list" onChange={() => {}} segments={VIEWS} />)
    const group = el.querySelector('[role="group"]')
    expect(group?.getAttribute('aria-label')).toBe('Calendar views')
    expect(group?.className).toContain('mu-seg'); expect(frequencyStyle('.mu-seg','background')).toBe(true)
    // THE KIT'S OWN MARKER (LIVE-475): what a caller's render test reads to tell a real adoption
    // from an import that is still spelled correctly over a hand-rolled row.
    expect(group?.getAttribute('data-segmented')).toBe('buttons')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Calendar', 'List', 'Workflow'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button'])
    // Ordinary buttons: Tab reaches each one, no roving tabindex.
    expect(buttons.every((b) => !b.hasAttribute('tabindex'))).toBe(true)
    expect(buttons[1].className).toContain('on')
    expect(buttons[1].className).toContain('on'); expect(frequencyStyle('.mu-seg>.on','color','var(--fq-surface-card)')).toBe(true)
    expect(buttons[0].className).not.toContain('on')
    // Segments respect --tap-min the way Button does, and no segment carries its own border.
    expect(buttons[0].className).toContain('tap-target')
    expect(buttons[0].className).not.toMatch(/(^|\s)border(\s|$)/)
  })

  it('reports the pressed segment on click and allows no selection at all', () => {
    const onChange = vi.fn()
    const el = mount(<SegmentedControl label="Calendar views" value={null} onChange={onChange} segments={VIEWS} />)
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    act(() => buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onChange).toHaveBeenCalledWith('workflow')
  })

  it('lets a caller own the selected look and hang data hooks on a segment', () => {
    const el = mount(
      <SegmentedControl
        label="Gatherings"
        orientation="vertical"
        value="a"
        onChange={() => {}}
        segments={[
          { value: 'a', label: 'Called off', selectedClassName: 'bg-surface-elevated line-through', data: { 'data-row': 'cancelled' } },
          { value: 'b', label: 'New moon sit', data: { 'data-row': 'event' } },
        ]}
      />,
    )
    const row = el.querySelector('[data-row="cancelled"]') as HTMLButtonElement
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(row.className).toContain('line-through')
    expect(row.className).not.toContain('on')
    expect(el.querySelector('[role="group"]')?.className).toContain('flex-col')
  })
})

describe('SegmentedLinks (navigation)', () => {
  it('is one named nav of real links, the current one aria-current and filled', () => {
    const el = mount(
      <SegmentedLinks
        label="Browse areas"
        activeHref="/housing"
        links={[
          { href: '/classifieds', label: 'Classifieds' },
          { href: '/housing', label: 'Housing' },
        ]}
      />,
    )
    const nav = el.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Browse areas')
    expect(nav?.getAttribute('data-segmented')).toBe('links')
    const links = [...el.querySelectorAll('a')]
    expect(links.map((a) => a.textContent)).toEqual(['Classifieds', 'Housing'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/classifieds', '/housing'])
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page'])
    expect(links[1].className).toContain('on')
    expect(links[0].className).not.toContain('on')
    expect(el.querySelectorAll('button')).toHaveLength(0)
    // The pill row is retired: no segment is a pill.
    expect(links.every((a) => !a.className.includes('rounded-pill'))).toBe(true)
  })
})

// The states the class owes (docs/INTERACTION-STATES.md section 2). A segmented box is
// Navigation: rest, hover and focus-visible, plus the pressed reading its two forms carry in
// aria-pressed and aria-current. Loading, empty, error, disabled and optimistic belong to the
// caller: a switcher between views that already exist never waits on anything.
describe('SegmentedControl rest, hover and focus-visible', () => {
  it('rest: an unselected segment is quiet text on the box, with no fill of its own', () => {
    const el = mount(<SegmentedControl label="Calendar views" value="admin" onChange={() => {}} segments={VIEWS} />)
    const idle = el.querySelectorAll('button')[1]!
    expect(idle.getAttribute('aria-pressed')).toBe('false')
    expect(idle.className).not.toContain('on'); expect(frequencyStyle('.mu-seg>*','color','var(--fq-text-muted)')).toBe(true)
    expect(idle.className).not.toContain('on')
  })

  it('hover: only the unselected segments answer the pointer, and the filled one does not move', () => {
    const el = mount(<SegmentedControl label="Calendar views" value="admin" onChange={() => {}} segments={VIEWS} />)
    const [selected, idle] = Array.from(el.querySelectorAll('button'))
    expect(idle!.className).not.toContain('on'); expect(frequencyStyle('.mu-seg>*:hover','background')).toBe(true)
    expect(idle!.className).not.toContain('on'); expect(frequencyStyle('.mu-seg>*:hover','color','var(--fq-text-strong)')).toBe(true)
    expect(selected!.className).toContain('on'); expect(frequencyStyle('.mu-seg>.on:hover','background','var(--fq-text-strong)')).toBe(true)
  })

  it('focus-visible: every segment is a real focusable control and its ring is never clipped', () => {
    const el = mount(<SegmentedControl label="Calendar views" value="admin" onChange={() => {}} segments={VIEWS} />)
    const buttons = Array.from(el.querySelectorAll('button'))
    expect(buttons).toHaveLength(3)
    for (const b of buttons) {
      expect(b.getAttribute('type')).toBe('button')
      expect(b.hasAttribute('tabindex')).toBe(false)
      expect(b.className).toContain('focus-visible:z-10')
    }
    const box = el.querySelector('[role="group"]')!
    expect(box.className).not.toContain('overflow-hidden')
    buttons[1]!.focus()
    expect(document.activeElement).toBe(buttons[1])
  })

  it('focus-visible: the link form is the same, on real links a keyboard can reach', () => {
    const el = mount(
      <SegmentedLinks
        label="Browse areas"
        activeHref="/housing"
        links={[
          { href: '/classifieds', label: 'Classifieds' },
          { href: '/housing', label: 'Housing' },
        ]}
      />,
    )
    for (const a of Array.from(el.querySelectorAll('a'))) {
      expect(a.hasAttribute('href')).toBe(true)
      expect(a.className).toContain('focus-visible:z-10')
    }
  })
})

describe('the ratchet promise', () => {
  /** scripts/adoption-baselines.json `raw-button-bg`: a raw <button> whose OPENING TAG carries bg-primary. */
  const RAW_BUTTON_BG = /<button\b(?:[^>=]|=>|=(?!>))*?\bbg-primary/
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const read = (f: string) => strip(readFileSync(join(process.cwd(), f), 'utf8'))

  it('no converted site, and not the primitive, paints bg-primary inside a raw <button> tag', () => {
    for (const file of [
      'components/ui/segmented-control.tsx',
      'components/spaces/calendar-mode-toggle.tsx',
      'components/spaces/calendar-workspace.tsx',
      'components/marketplace/facet-nav.tsx',
    ]) {
      expect(read(file), `${file} hand-rolls a bg-primary button again`).not.toMatch(RAW_BUTTON_BG)
    }
  })

  // The List view's switcher left with the public tab's retired team mode (SCAN-1344).
  it('the switchers compose the primitive and no pill row remains', () => {
    expect(read('components/spaces/calendar-mode-toggle.tsx')).toContain("from '@/components/ui/segmented-control'")
    expect(read('components/marketplace/facet-nav.tsx')).toContain("from '@/components/ui/segmented-control'")
    expect(read('components/marketplace/facet-nav.tsx')).not.toContain('rounded-pill')
  })
})

// THE COMPACT SIZE (SCAN-1133 slice 9). `xs` is the editor inspector's density: utility classes
// only, so it styles in a body-portaled sheet outside `[data-kit]`, where the `.mu-seg` sheet does
// not reach. It is additive: `sm` and `md` must render exactly what they rendered before.
describe('SegmentedControl size="xs" (compact)', () => {
  const ALIGN = [
    { value: 'left', label: <svg data-glyph="left" />, ariaLabel: 'Align left', title: 'Align left', className: 'w-8' },
    { value: 'center', label: <svg data-glyph="center" />, ariaLabel: 'Align center', title: 'Align center', className: 'w-8' },
  ] as const

  it('is the same named group of pressed buttons, drawn without the kit sheet', () => {
    const el = mount(<SegmentedControl size="xs" label="Shape" value="list" onChange={() => {}} segments={VIEWS} />)
    const group = el.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Shape')
    expect(group.getAttribute('data-segmented')).toBe('buttons')
    // No `.mu-seg`: that sheet is scoped to the kit and fixes a 36px segment a utility cannot shrink.
    expect(group.className.split(/\s+/)).not.toContain('mu-seg')
    expect(group.className).toContain('bg-surface-elevated')
    expect(group.className).toContain('flex-wrap')
    expect(group.className).not.toContain('overflow-hidden')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button'])
    expect(buttons[1].className).toContain('bg-primary text-on-primary')
    expect(buttons[0].className).not.toContain('bg-primary')
    expect(buttons[0].className).toContain('text-muted')
    for (const b of buttons) {
      expect(b.className).toContain('min-h-6')
      expect(b.className).toContain('focus-visible:z-10')
      // Dense on purpose: the 44px touch floor is the size the inspector could not hold.
      expect(b.className).not.toContain('tap-target')
      expect(b.className.split(/\s+/)).not.toContain('on')
    }
  })

  it('tokens only: no hex and no arbitrary pixel value in any compact class', () => {
    const el = mount(<SegmentedControl size="xs" label="Shape" value="list" onChange={() => {}} segments={VIEWS} />)
    const classes = [el.querySelector('[role="group"]')!, ...el.querySelectorAll('button')].map((n) => n.className).join(' ')
    expect(classes).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(classes).not.toMatch(/\[[^\]]*px\]/)
  })

  it('names an icon-only segment and reports the pressed one', () => {
    const onChange = vi.fn()
    const el = mount(<SegmentedControl size="xs" label="Align" value="left" onChange={onChange} segments={ALIGN} />)
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Align left', 'Align center'])
    expect(buttons.map((b) => b.getAttribute('title'))).toEqual(['Align left', 'Align center'])
    expect(buttons[0].className).toContain('w-8')
    act(() => buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onChange).toHaveBeenCalledWith('center')
  })

  it('lets a caller own the selected look, as the larger sizes do', () => {
    const el = mount(
      <SegmentedControl
        size="xs"
        label="Stage"
        value="a"
        onChange={() => {}}
        segments={[{ value: 'a', label: 'Called off', selectedClassName: 'bg-surface line-through' }, { value: 'b', label: 'On' }]}
      />,
    )
    const selected = el.querySelector('button')!
    expect(selected.className).toContain('line-through')
    expect(selected.className).not.toContain('bg-primary')
  })

  it('is additive: sm and md render exactly the classes they rendered before xs existed', () => {
    const sm = mount(<SegmentedControl label="Calendar views" value="list" onChange={() => {}} segments={VIEWS} />)
    expect(sm.querySelector('[role="group"]')!.className).toBe('mu-seg inline-flex max-w-full flex-wrap')
    expect([...sm.querySelectorAll('button')].map((b) => b.className)).toEqual([
      'press tap-target focus-visible:z-10',
      'press tap-target focus-visible:z-10 on',
      'press tap-target focus-visible:z-10',
    ])
    // A plain segment carries no name or tooltip of its own: the visible text is the name.
    expect([...sm.querySelectorAll('button')].every((b) => !b.hasAttribute('aria-label') && !b.hasAttribute('title'))).toBe(true)
    act(() => root!.unmount())
    container!.remove()
    const md = mount(<SegmentedControl size="md" orientation="vertical" label="Gatherings" value="list" onChange={() => {}} segments={VIEWS} />)
    expect(md.querySelector('[role="group"]')!.className).toBe('mu-seg mu-v flex w-full flex-col')
    expect(md.querySelectorAll('button')[1]!.className).toBe('press tap-target focus-visible:z-10 mu-md on')
    act(() => root!.unmount())
    container!.remove()
    const links = mount(<SegmentedLinks label="Browse areas" activeHref="/b" links={[{ href: '/a', label: 'A' }, { href: '/b', label: 'B' }]} />)
    expect(links.querySelector('nav')!.className).toBe('mu-seg inline-flex max-w-full flex-wrap')
    expect([...links.querySelectorAll('a')].map((a) => a.className)).toEqual([
      'press tap-target focus-visible:z-10',
      'press tap-target focus-visible:z-10 on',
    ])
  })
})
