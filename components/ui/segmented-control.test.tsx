// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SegmentedControl, SegmentedLinks } from './segmented-control'

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
    expect(group?.className).toContain('border-border')
    // THE KIT'S OWN MARKER (LIVE-475): what a caller's render test reads to tell a real adoption
    // from an import that is still spelled correctly over a hand-rolled row.
    expect(group?.getAttribute('data-segmented')).toBe('buttons')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Calendar', 'List', 'Workflow'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button'])
    // Ordinary buttons: Tab reaches each one, no roving tabindex.
    expect(buttons.every((b) => !b.hasAttribute('tabindex'))).toBe(true)
    expect(buttons[1].className).toContain('bg-primary')
    expect(buttons[1].className).toContain('text-on-primary')
    expect(buttons[0].className).not.toContain('bg-primary')
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
    expect(row.className).not.toContain('bg-primary')
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
    expect(links[1].className).toContain('bg-primary')
    expect(links[0].className).not.toContain('bg-primary')
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
    expect(idle.className).toContain('text-muted')
    expect(idle.className).not.toContain('bg-primary')
  })

  it('hover: only the unselected segments answer the pointer, and the filled one does not move', () => {
    const el = mount(<SegmentedControl label="Calendar views" value="admin" onChange={() => {}} segments={VIEWS} />)
    const [selected, idle] = Array.from(el.querySelectorAll('button'))
    expect(idle!.className).toContain('hover:bg-surface-elevated')
    expect(idle!.className).toContain('hover:text-text')
    expect(selected!.className).not.toContain('hover:bg-surface-elevated')
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
      'components/spaces/calendar-list-view.tsx',
      'components/spaces/calendar-workspace.tsx',
      'components/spaces/calendar-console.tsx',
      'components/marketplace/facet-nav.tsx',
    ]) {
      expect(read(file), `${file} hand-rolls a bg-primary button again`).not.toMatch(RAW_BUTTON_BG)
    }
  })

  it('the three switchers compose the primitive and no pill row remains', () => {
    expect(read('components/spaces/calendar-mode-toggle.tsx')).toContain("from '@/components/ui/segmented-control'")
    expect(read('components/spaces/calendar-list-view.tsx')).toContain("from '@/components/ui/segmented-control'")
    expect(read('components/marketplace/facet-nav.tsx')).toContain("from '@/components/ui/segmented-control'")
    expect(read('components/marketplace/facet-nav.tsx')).not.toContain('rounded-pill')
  })
})
