// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ push: vi.fn(), startBuild: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('./actions', () => ({ startBuild: h.startBuild }))
vi.mock('@/lib/messaging/goals', () => {
  const goal = { key: 'welcome', object: 'campaign', label: 'Welcome guests', blurb: 'Help guests return', suggestedName: 'Welcome', outline: [], tips: [] }
  return { MESSAGING_GOALS: [goal], MESSAGING_TONES: [{ key: 'plain', label: 'Plain' }], getMessagingGoal: () => goal }
})
import { GuidedSetup } from './guided-client'
it('shows coaching without navigation or replacing authored answers', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const click = async (label: string) => { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label))!.click()) }
  try {
    h.startBuild.mockResolvedValue({ data: { href: '', veraPending: false, coaching: { questions: ['Which next step matters?'], checks: ['Confirm the date.'], measurement: 'Returning guests' } } })
    await act(async () => root.render(<GuidedSetup segments={[{ key: 'guests', label: 'Guests' }]} />))
    await click('Welcome guests')
    const field = host.querySelector('textarea')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'My own campaign notes.'); field.dispatchEvent(new Event('input', { bubbles: true })) })
    await click('Continue')
    await click('Coach my plan')
    expect(host.querySelector('[aria-label="Writing coaching"]')?.textContent).toContain('Which next step matters?')
    expect(h.push).not.toHaveBeenCalled()
    expect(h.startBuild).toHaveBeenCalledTimes(1)
    await click('Back')
    expect(host.querySelector('textarea')!.value).toBe('My own campaign notes.')
  } finally { act(() => root.unmount()); host.remove() }
})
