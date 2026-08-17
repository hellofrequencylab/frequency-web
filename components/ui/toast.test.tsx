// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Zap } from 'lucide-react'
import { Toast } from './toast'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ZapToastContainer } from '@/components/zap-toast'

// Locks the ONE Toast (DAWN feedback/Toast) and, just as importantly, locks the two
// behaviours the unification could plausibly have dropped on the floor.
//
// Before this pass the product had two toast renderers that shared only the lane they
// rendered into: two card shells, two elevation vocabularies, two copies of the slide-up
// entrance, and two copies of the dismissal timer with different delays. The delay was the
// only real difference. So the tests below assert (a) the primitive's own contract and
// (b) that BOTH production toasts still behave exactly as they did — same trigger event,
// same copy, same dwell — now that they compose it.

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.useRealTimers()
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

describe('Toast', () => {
  it('announces itself politely — a toast is a status, not silence', () => {
    // Neither predecessor carried a role, so a member on a screen reader was awarded
    // Zaps in total silence. This is the one behaviour the merge ADDED.
    const c = mount(<Toast title="+15 Zaps" duration={0} />)
    expect(c.querySelector('[role="status"]')).not.toBeNull()
  })

  it('enters on the slideUp keyframes and sits on the .lift-3 elevation', () => {
    const c = mount(<Toast title="Saved" duration={0} />)
    const el = c.querySelector('[role="status"]')!
    expect(el.className).toContain('animate-[slideUp_0.4s_ease-out]')
    // Elevation via the named lift, never a shadow literal (the achievement card used
    // `shadow-xl` + a conditional `shadow-lg`; both are retired here).
    expect(el.className).toContain('lift-3')
    expect(el.className).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/)
    // Radius via the role, never a literal step.
    expect(el.className).toContain('rounded-card')
    expect(el.className).not.toMatch(/\brounded-(xl|2xl|3xl)\b/)
  })

  it('auto-dismisses at its own duration, and not one tick early', () => {
    const onDismiss = vi.fn()
    mount(<Toast title="+15 Zaps" duration={4000} onDismiss={onDismiss} />)
    act(() => void vi.advanceTimersByTime(3999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('clears its timer on unmount (no dismissal fired at a dead component)', () => {
    const onDismiss = vi.fn()
    mount(<Toast title="Gone" duration={4000} onDismiss={onDismiss} />)
    act(() => root!.unmount())
    root = null
    act(() => void vi.advanceTimersByTime(10_000))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('duration={0} pins the toast open', () => {
    const onDismiss = vi.fn()
    mount(<Toast title="Stay" duration={0} dismissible onDismiss={onDismiss} />)
    act(() => void vi.advanceTimersByTime(60_000))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('shows the dismiss control only when asked, and wires it to onDismiss', () => {
    const quiet = mount(<Toast title="No button" duration={0} onDismiss={() => {}} />)
    expect(quiet.querySelector('button')).toBeNull()

    const onDismiss = vi.fn()
    const c = mount(<Toast title="Dismissable" duration={0} dismissible onDismiss={onDismiss} />)
    const btn = c.querySelector('button')!
    expect(btn.getAttribute('aria-label')).toBe('Dismiss')
    act(() => btn.click())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('tones the frame and the icon chip, and leaves the glyph out of the a11y tree', () => {
    const c = mount(
      <Toast title="+15 Zaps" tone="primary" duration={0} icon={<Zap className="h-5 w-5" />} />,
    )
    expect(c.querySelector('[role="status"]')!.className).toContain('border-primary-bg')
    const chip = c.querySelector('span[aria-hidden]')!
    expect(chip.className).toContain('bg-primary-bg')
    expect(chip.className).toContain('text-primary-strong')
    // The title carries the meaning; the glyph is decoration.
    expect(chip.getAttribute('aria-hidden')).toBe('true')
  })

  it('a skin overrides the tone — the escape for a colour that comes from a record', () => {
    // An achievement is tinted by its TIER, which is data out of lib/gamification.ts. A tone
    // enum cannot absorb that, so `skin` is the documented (and only) way past `tone`.
    const c = mount(
      <Toast
        title="Trailblazer"
        duration={0}
        tone="primary"
        skin={{
          surface: 'bg-rank-gold/10',
          border: 'border-rank-gold/35',
          ink: 'text-rank-gold-deep',
          glow: 'ring-1 ring-rank-gold/45',
        }}
      />,
    )
    const el = c.querySelector('[role="status"]')!
    expect(el.className).toContain('bg-rank-gold/10')
    expect(el.className).toContain('ring-1 ring-rank-gold/45')
    // The tone it was also handed must not paint alongside the skin.
    expect(el.className).not.toContain('border-primary-bg')
  })

  it('paints no raw colour of its own', () => {
    const c = mount(<Toast title="Token-only" duration={0} icon={<Zap className="h-5 w-5" />} />)
    expect(c.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(c.innerHTML).not.toMatch(/\b(rgb|hsl)a?\(/i)
  })
})

// ── The two production toasts, still behaving exactly as they did ──────────────

describe('the toasts that compose it', () => {
  it('ZapToastContainer still answers its event, its copy and its 4s dwell', () => {
    const c = mount(<ZapToastContainer />)
    act(() => {
      window.dispatchEvent(new CustomEvent('zaps-earned', { detail: { amount: 15 } }))
    })
    const toast = c.querySelector('[role="status"]')!
    expect(toast).not.toBeNull()
    expect(toast.textContent).toContain('+15 Zaps')
    // The default label survived the move.
    expect(toast.textContent).toContain('Verified practice')

    act(() => void vi.advanceTimersByTime(3999))
    expect(c.querySelector('[role="status"]')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(c.querySelector('[role="status"]')).toBeNull()
  })

  it('ZapToastContainer still ignores a zero/negative award', () => {
    const c = mount(<ZapToastContainer />)
    act(() => {
      window.dispatchEvent(new CustomEvent('zaps-earned', { detail: { amount: 0 } }))
    })
    expect(c.querySelector('[role="status"]')).toBeNull()
  })

  it('AchievementToastContainer keeps its eyebrow, tier chip, reward line and 6s dwell', () => {
    const c = mount(<AchievementToastContainer />)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('achievement-unlocked', {
          detail: {
            id: 'a1',
            name: 'First Light',
            description: 'You logged your first practice.',
            icon: 'flame',
            tier: 'gold',
            zapsReward: 50,
          },
        }),
      )
    })
    const toast = c.querySelector('[role="status"]')!
    expect(toast).not.toBeNull()
    expect(toast.textContent).toContain('Achievement Unlocked')
    expect(toast.textContent).toContain('First Light')
    expect(toast.textContent).toContain('You logged your first practice.')
    expect(toast.textContent).toContain('Gold')
    expect(toast.textContent).toContain('+50 Zaps')  // proper noun (NAMING.md, ADR-1065)
    // The tier tint reaches the frame through `skin`, off the rank spectrum.
    expect(toast.className).toContain('bg-rank-gold')
    // Its own fixed width is layout the caller owns, not something the primitive assumes.
    expect(toast.className).toContain('w-80')

    // Twice the dwell of a Zap notice — a Quest award is worth reading.
    act(() => void vi.advanceTimersByTime(5999))
    expect(c.querySelector('[role="status"]')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(c.querySelector('[role="status"]')).toBeNull()
  })

  it('AchievementToastContainer still dismisses on its X before the timer', () => {
    const c = mount(<AchievementToastContainer />)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('achievement-unlocked', {
          detail: {
            id: 'a2',
            name: 'Steady',
            description: 'Seven days running.',
            icon: 'flame',
            tier: 'bronze',
            zapsReward: 0,
          },
        }),
      )
    })
    // zapsReward 0 shows no reward line (a zero is not a reward).
    expect(c.querySelector('[role="status"]')!.textContent).not.toContain('Zaps')
    act(() => c.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click())
    expect(c.querySelector('[role="status"]')).toBeNull()
  })
})
