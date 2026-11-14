// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LookRows } from './create-space-look'
import { getOnboardingNicheChoices } from '@/lib/create-space/niche-choices.server'

it('offers all nine optional niche chips below the existing look controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const onNiche = vi.fn()
  const onKit = vi.fn()
  const onAccent = vi.fn()
  const el = document.createElement('div')
  document.body.append(el)
  const root = createRoot(el)
  try {
    await act(async () => root.render(<LookRows kits={[{ id: 'new-world', label: 'New World' }]} kit="new-world" accents={[{ name: 'Tide', fill: 'var(--fq-accent)' }]} accentAt={0} onKit={onKit} onAccent={onAccent} niches={getOnboardingNicheChoices()} niche="coaches" onNiche={onNiche} />))
    const row = el.querySelector('[role="radiogroup"][aria-label="What are you building?"]')!
    expect(row.querySelectorAll('[role="radio"]')).toHaveLength(9)
    expect([...row.querySelectorAll('button')].find((button) => button.textContent === 'Coaches and healers')!.getAttribute('aria-checked')).toBe('true')
    await act(async () => [...row.querySelectorAll('button')].find((button) => button.textContent === 'Spiritual community')!.click())
    expect(onNiche).toHaveBeenCalledWith('faith')
    expect(onKit).not.toHaveBeenCalled()
    expect(onAccent).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    el.remove()
    vi.unstubAllGlobals()
  }
})
