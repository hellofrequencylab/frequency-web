// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { PlanPeriodScope, PlanPeriodSwitch } from './plan-period'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
it('keeps both active pricing bands synchronized with the shared billing period', () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    act(() => root.render(<PlanPeriodScope><PlanPeriodSwitch note="Actual catalog note" /><div>Personal plans</div><PlanPeriodSwitch note="Actual catalog note" /><div>Space plans</div></PlanPeriodScope>))
    expect(host.querySelector('[data-period]')?.getAttribute('data-period')).toBe('month')
    const choices = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    act(() => choices[1].click())
    expect(host.querySelector('[data-period]')?.getAttribute('data-period')).toBe('year')
    expect(choices.map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'true'])
    act(() => choices[2].click())
    expect(host.querySelector('[data-period]')?.getAttribute('data-period')).toBe('month')
    expect(choices.map(b => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false'])
    expect(host.textContent).toContain('Personal plans'); expect(host.textContent).toContain('Space plans')
  } finally { act(() => root.unmount()); host.remove() }
})
