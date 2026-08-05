// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Badge, badgeClasses, type BadgeTone } from './badge'
import { DemoBadge } from './demo-badge'
import { FeaturedBadge } from './featured-badge'
import { StarterBadge } from './starter-badge'
import { UnclaimedBadge } from './unclaimed-badge'
import { SupporterBadge } from '../supporter-badge'

// Locks the DAWN Badge contract (design_handoff/dawn/components/core/Badge.jsx): the tone
// vocabulary, the tokens each tone resolves to, and the fact that the five status pills that
// used to hand-roll their own padding/radius/size/colour now all read from THIS scale. A tone
// that silently changes token here changes meaning on every browse card in the product.

const TONES: BadgeTone[] = ['neutral', 'primary', 'signal', 'broadcast', 'success', 'warning', 'danger']

// The one true tone → utility table. Duplicated from the component ON PURPOSE: a test that
// imported the map would pass no matter what the map said.
const EXPECTED: Record<BadgeTone, { bg: string; fg: string; border: string; solidBg: string; solidFg: string }> = {
  neutral: {
    bg: 'bg-surface-elevated',
    fg: 'text-muted',
    border: 'border-border',
    solidBg: 'bg-muted',
    solidFg: 'text-surface',
  },
  primary: {
    bg: 'bg-primary-bg',
    fg: 'text-primary-strong',
    border: 'border-transparent',
    solidBg: 'bg-primary',
    solidFg: 'text-on-primary',
  },
  signal: {
    bg: 'bg-signal-bg',
    fg: 'text-signal-strong',
    border: 'border-transparent',
    solidBg: 'bg-signal',
    solidFg: 'text-on-signal',
  },
  broadcast: {
    bg: 'bg-broadcast-bg',
    fg: 'text-broadcast-strong',
    border: 'border-transparent',
    solidBg: 'bg-broadcast',
    solidFg: 'text-on-broadcast',
  },
  success: {
    bg: 'bg-success-bg',
    fg: 'text-success',
    border: 'border-transparent',
    solidBg: 'bg-success',
    solidFg: 'text-on-success',
  },
  warning: {
    bg: 'bg-warning-bg',
    fg: 'text-warning',
    border: 'border-transparent',
    solidBg: 'bg-warning',
    solidFg: 'text-on-warning',
  },
  danger: {
    bg: 'bg-danger-bg',
    fg: 'text-danger',
    border: 'border-transparent',
    solidBg: 'bg-danger',
    solidFg: 'text-on-danger',
  },
}

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

/** The badge element itself — every badge renders exactly one outer span. */
function pill(c: HTMLElement) {
  return c.firstElementChild as HTMLSpanElement
}

function classes(c: HTMLElement) {
  return pill(c).className.split(/\s+/)
}

describe('Badge tone → utility mapping', () => {
  it.each(TONES)('renders %s with its background, label and border tokens', (tone) => {
    const c = mount(<Badge tone={tone}>Label</Badge>)
    const cls = classes(c)
    expect(cls).toContain(EXPECTED[tone].bg)
    expect(cls).toContain(EXPECTED[tone].fg)
    expect(cls).toContain(EXPECTED[tone].border)
    expect(pill(c).textContent).toBe('Label')
  })

  it.each(TONES)('fills %s with the tone and its purpose-built on-* label token when solid', (tone) => {
    const c = mount(
      <Badge tone={tone} solid>
        Label
      </Badge>,
    )
    const cls = classes(c)
    expect(cls).toContain(EXPECTED[tone].solidBg)
    expect(cls).toContain(EXPECTED[tone].solidFg)
    // A solid badge must NOT also carry the tinted wash.
    expect(cls).not.toContain(EXPECTED[tone].bg)
  })

  it('defaults to neutral — a badge never spends an accent by accident', () => {
    const c = mount(<Badge>Label</Badge>)
    expect(classes(c)).toContain(EXPECTED.neutral.bg)
    expect(badgeClasses()).toBe(badgeClasses('neutral', 'md'))
  })

  it('keeps every tone distinguishable — no two tones resolve to the same class string', () => {
    const strings = TONES.map((t) => badgeClasses(t))
    expect(new Set(strings).size).toBe(TONES.length)
  })
})

describe('Badge shape', () => {
  it('takes the ROLE radius, never a literal step', () => {
    const cls = classes(mount(<Badge>Label</Badge>))
    expect(cls).toContain('rounded-pill')
    expect(cls.some((c) => /^rounded-(?:sm|md|lg|xl|2xl|3xl|full)$/.test(c))).toBe(false)
  })

  it('sizes type from the named scale, never an arbitrary px value', () => {
    expect(badgeClasses('primary', 'md')).toContain('text-meta')
    expect(badgeClasses('primary', 'sm')).toContain('text-3xs')
    for (const size of ['sm', 'md'] as const) {
      expect(badgeClasses('primary', size)).not.toMatch(/text-\[\d/)
    }
  })

  it('gives the sm marker its uppercase card treatment and md DAWN sentence case', () => {
    expect(badgeClasses('primary', 'sm')).toContain('uppercase')
    expect(badgeClasses('primary', 'md')).not.toContain('uppercase')
  })

  it('owns the glyph size so a call site never re-derives it', () => {
    expect(badgeClasses('primary', 'sm')).toContain('[&>svg]:size-2.5')
    expect(badgeClasses('primary', 'md')).toContain('[&>svg]:size-3')
  })

  it('carries no raw hex, rgb() or Tailwind palette class in any tone', () => {
    for (const tone of TONES) {
      for (const solid of [false, true]) {
        const s = badgeClasses(tone, 'md', { solid })
        expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
        expect(s).not.toMatch(/rgba?\(/)
        expect(s).not.toMatch(/-(?:amber|teal|green|red|yellow|gray|slate|zinc|stone|neutral)-\d{2,3}\b/)
      }
    }
  })

  it('merges a caller className without dropping the scale', () => {
    const c = mount(<Badge className="mt-0.5">Label</Badge>)
    const cls = classes(c)
    expect(cls).toContain('mt-0.5')
    expect(cls).toContain('rounded-pill')
  })

  it('renders a leading icon before the label', () => {
    const c = mount(<Badge icon={<svg data-testid="glyph" />}>Label</Badge>)
    expect(pill(c).firstElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('passes span attributes through, so the tooltip survives', () => {
    const c = mount(<Badge title="Why this is here">Label</Badge>)
    expect(pill(c).getAttribute('title')).toBe('Why this is here')
  })
})

// The consolidation itself: each status pill still says exactly what it said before, and now
// says it through the primitive rather than a hand-rolled class string.
describe('the five status pills compose Badge', () => {
  const CASES = [
    { name: 'Demo', node: <DemoBadge />, tone: 'warning' as const, label: 'Demo' },
    { name: 'Featured', node: <FeaturedBadge />, tone: 'signal' as const, label: 'Featured' },
    { name: 'Starter', node: <StarterBadge />, tone: 'primary' as const, label: 'Starter' },
    { name: 'Unclaimed', node: <UnclaimedBadge />, tone: 'primary' as const, label: 'Unclaimed' },
    { name: 'Supporter', node: <SupporterBadge />, tone: 'signal' as const, label: 'Supporter' },
  ]

  it.each(CASES)('$name keeps its tone, its label and its tooltip', ({ node, tone, label }) => {
    const c = mount(node)
    const cls = classes(c)
    expect(cls).toContain(EXPECTED[tone].bg)
    expect(cls).toContain(EXPECTED[tone].fg)
    expect(pill(c).textContent).toBe(label)
    expect(pill(c).getAttribute('title')).toBeTruthy()
  })

  it.each(CASES)('$name is the shared sm marker, not a bespoke pill', ({ node }) => {
    const cls = classes(mount(node)).join(' ')
    expect(cls).toContain('rounded-pill')
    expect(cls).toContain('text-3xs')
    // The drift this consolidation removed: Supporter used to sit on px-2 while its
    // four siblings sat on px-1.5. All five now read the same padding from the scale.
    expect(cls).toContain('px-1.5')
  })

  it('carries one glyph per pill, sized by the primitive rather than the call site', () => {
    for (const { node } of CASES) {
      const c = mount(node)
      const svgs = pill(c).querySelectorAll('svg')
      expect(svgs).toHaveLength(1)
      expect(svgs[0].getAttribute('class') ?? '').not.toMatch(/\b[hw]-2\.5\b/)
      act(() => root!.unmount())
      container!.remove()
      root = null
      container = null
    }
  })

  it('drops the Supporter label in compact mode but keeps the pill and its heart', () => {
    const c = mount(<SupporterBadge compact />)
    expect(pill(c).textContent).toBe('')
    expect(pill(c).querySelectorAll('svg')).toHaveLength(1)
    expect(classes(c)).toContain(EXPECTED.signal.bg)
  })
})
