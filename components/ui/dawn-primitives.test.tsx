// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RANK_LABELS, RANK_TO_KEY, RANK_ORDER, type SeasonRank } from '@/lib/season-ranks'
import { RankBadge } from './rank-badge'
import { Stat } from './stat'

// Locks the contracts of the two DAWN primitives added in this pass (RankBadge, Stat).
//
// The third on the list, Glyph, was deliberately NOT built: `components/ui/icon.tsx`
// (ADR-505) is already the house icon primitive and already delivers everything DAWN's
// Glyph exists for in a React-owned codebase — aria-hidden by default, currentColor, and
// sizing off the type scale — while lucide-react itself emits `aria-hidden="true"` when no
// a11y prop is passed. There is nothing left for a wrapper to add, so there is nothing here
// to test. The reasoning lives in the pass report, not in a placeholder component.
//
// What these tests actually guard, beyond "it renders":
//   · RankBadge DRIVES the existing `.rank-badge` CSS primitive rather than reimplementing
//     it, and resolves colour through the ONE canonical mapping in lib/season-ranks.ts.
//   · A zero (Ghost, 0/3) is muted, never red — the counter law.
//   · Stat sizes off the `text-stat` ROLE, not a literal display step, and carries none of
//     StatCard's operator affordances (no delta, no sparkline, no drill-down).

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

describe('RankBadge', () => {
  it('drives the existing .rank-badge CSS primitive off its three vars', () => {
    const c = mount(<RankBadge rank="master" />)
    const el = c.querySelector<HTMLElement>('.rank-badge')!
    expect(el).not.toBeNull()
    // The primitive reads core / deep / bright. All three must be set, or the badge loses
    // its label colour in one of the two themes.
    expect(el.style.getPropertyValue('--rank')).toBe('var(--rank-jade)')
    expect(el.style.getPropertyValue('--rank-deep')).toBe('var(--rank-jade-deep)')
    expect(el.style.getPropertyValue('--rank-bright')).toBe('var(--rank-jade-bright)')
  })

  it('paints no colour of its own — the CSS primitive owns the wash, border and dark rule', () => {
    const c = mount(<RankBadge rank="adept" />)
    const el = c.querySelector<HTMLElement>('.rank-badge')!
    // A Tailwind reimplementation is the duplicate this pass exists to retire.
    expect(el.className).not.toMatch(/\b(bg|border|text)-rank-/)
    expect(el.getAttribute('style')).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('resolves every season rank through the one canonical RANK_TO_KEY mapping', () => {
    for (const rank of RANK_ORDER) {
      const c = mount(<RankBadge rank={rank} />)
      const el = c.querySelector<HTMLElement>('.rank-badge')!
      expect(el.style.getPropertyValue('--rank')).toBe(`var(--rank-${RANK_TO_KEY[rank]})`)
      expect(el.textContent).toContain(RANK_LABELS[rank])
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })

  it('renders the .rank-dot by default, decoratively, and drops it on request', () => {
    const withDot = mount(<RankBadge rank="initiate" />)
    const dot = withDot.querySelector('.rank-dot')!
    expect(dot).not.toBeNull()
    expect(dot.getAttribute('aria-hidden')).toBe('true')

    act(() => root!.unmount())
    container!.remove()
    const without = mount(<RankBadge rank="initiate" dot={false} />)
    expect(without.querySelector('.rank-dot')).toBeNull()
  })

  it('takes a label override', () => {
    const c = mount(<RankBadge rank="master">Master · season 1</RankBadge>)
    expect(c.textContent).toContain('Master · season 1')
    expect(c.textContent).not.toContain('MasterMaster')
  })

  it('showStep reads the completion honestly, in mono + tabular figures', () => {
    const c = mount(<RankBadge rank="adept" showStep />)
    const step = c.querySelector<HTMLElement>('.font-mono')!
    expect(step).not.toBeNull()
    expect(step.textContent).toBe('2/3')
    expect(step.className).toContain('tabular-nums')
  })

  it('a Ghost zero is muted, never red', () => {
    const c = mount(<RankBadge rank="ghost" showStep />)
    const step = c.querySelector<HTMLElement>('.font-mono')!
    expect(step.textContent).toBe('0/3')
    // Ghost is a real status, not a failure state.
    expect(step.className).toContain('opacity-70')
    expect(c.innerHTML).not.toMatch(/danger|text-red|warning/)
  })

  it('ignores showStep for a spectrum colour, which has no ladder position', () => {
    const c = mount(<RankBadge rank="plum" showStep />)
    expect(c.querySelector('.font-mono')).toBeNull()
    expect(c.textContent).toContain('Plum')
    expect(c.querySelector<HTMLElement>('.rank-badge')!.style.getPropertyValue('--rank')).toBe(
      'var(--rank-plum)',
    )
  })

  it('sizes off the type roles, never an arbitrary px step', () => {
    for (const [size, role] of [
      ['sm', 'text-3xs'],
      ['md', 'text-2xs'],
      ['lg', 'text-meta'],
    ] as const) {
      const c = mount(<RankBadge rank="adept" size={size} />)
      const el = c.querySelector<HTMLElement>('.rank-badge')!
      expect(el.className).toContain(role)
      expect(el.className).not.toMatch(/text-\[\d/)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })

  it('merges a caller className and passes through span attributes', () => {
    const c = mount(<RankBadge rank="adept" className="w-fit" title="Season rank" />)
    const el = c.querySelector<HTMLElement>('.rank-badge')!
    expect(el.className).toContain('w-fit')
    expect(el.className).toContain('rank-badge')
    expect(el.getAttribute('title')).toBe('Season rank')
  })

  it('falls back to stone, never to a higher rank, on an unrecognised value', () => {
    // Defensive: rank values arrive from the DB enum, and a future enum member must not
    // render as gold (Adept) before the mapping catches up.
    const c = mount(<RankBadge rank={'legend' as unknown as SeasonRank} />)
    expect(c.querySelector<HTMLElement>('.rank-badge')!.style.getPropertyValue('--rank')).toBe(
      'var(--rank-stone)',
    )
  })
})

describe('Stat', () => {
  it('renders the numeral on the text-stat ROLE in the display face', () => {
    const c = mount(<Stat value="1.2k" label="Practices this week" />)
    const value = c.querySelector<HTMLElement>('.font-display')!
    expect(value).not.toBeNull()
    expect(value.textContent).toBe('1.2k')
    expect(value.className).toContain('text-stat')
    // The literal-display-type debt this primitive exists to stop growing.
    expect(value.className).not.toMatch(/\btext-(?:[3-9]xl|\d+xl)\b/)
    expect(value.className).toContain('tabular-nums')
  })

  it('captions the numeral with the eyebrow treatment', () => {
    const c = mount(<Stat value={24} label="Circles near you" />)
    const label = c.querySelectorAll('p')[1]!
    expect(label.textContent).toBe('Circles near you')
    expect(label.className).toContain('uppercase')
    expect(label.className).toContain('tracking-eyebrow')
    expect(label.className).toContain('text-meta')
  })

  it('swaps to the on-ink pair inside a dark band', () => {
    const c = mount(<Stat value={38} label="Events" tone="ink" />)
    const [value, label] = Array.from(c.querySelectorAll('p'))
    expect(value!.className).toContain('text-on-ink')
    expect(label!.className).toContain('text-on-ink-subtle')
    expect(value!.className).not.toContain('text-text')
  })

  it('carries none of StatCard’s operator affordances', () => {
    // DAWN §6: analytics deltas never appear on a member-facing surface. A Stat is a
    // headline, so no trend arrow, no sparkline, no drill-down link.
    const c = mount(<Stat value={24} label="Circles near you" />)
    expect(c.querySelector('svg')).toBeNull()
    expect(c.querySelector('a')).toBeNull()
    expect(c.textContent).toBe('24Circles near you')
  })

  it('merges a caller className on the wrapper, so a strip can lay it out', () => {
    const c = mount(<Stat value={7} label="Events" className="text-center" />)
    expect((c.firstElementChild as HTMLElement).className).toBe('text-center')
  })
})
