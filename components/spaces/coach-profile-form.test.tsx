// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySpaceCoachProfile } from '@/lib/spaces/coach-profile'
const save = vi.hoisted(() => vi.fn())
vi.mock('@/app/(main)/spaces/[slug]/settings/coach/actions', () => ({ saveSpaceCoachProfile: save }))
import { CoachProfileForm } from './coach-profile-form'
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  save.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
function mount(readOnly = false) {
  act(() => root.render(<CoachProfileForm spaceId="space-A" initial={{ ...emptySpaceCoachProfile(), goals: 'Return visits' }} readOnly={readOnly} />))
}
async function submit() { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }
function status() { return host.querySelector('[role="status"]')!.textContent }
function goals() { return (host.querySelector('#coach-goals') as HTMLTextAreaElement).value }
function clear() { return [...host.querySelectorAll('button')].find((b) => b.textContent === 'Clear preferences')! }
describe('Space coach preferences form', () => {
  it('saves the owner input for the current Space and shows confirmed server result', async () => {
    const confirmed = { ...emptySpaceCoachProfile(), goals: 'Return visits' }
    save.mockResolvedValue({ data: confirmed })
    mount()
    await submit()
    expect(save).toHaveBeenCalledExactlyOnceWith('space-A', confirmed)
    expect(status()).toBe('Coach preferences saved.')
  })
  it('keeps the owner input and shows a refused save without claiming success', async () => {
    save.mockResolvedValue({ error: 'You do not have permission to edit this Space.' })
    mount()
    await submit()
    expect(goals()).toBe('Return visits')
    expect(status()).toContain('permission')
    expect(status()).not.toContain('saved')
  })
  it('keeps input when transport fails', async () => {
    save.mockRejectedValue(new Error('offline'))
    mount()
    await submit()
    expect(goals()).toBe('Return visits')
    expect(status()).toBe('Your preferences could not be saved. Try again.')
  })
  it('clears only after confirmation and resets fields only after server success', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    await act(async () => clear().click())
    expect(save).not.toHaveBeenCalled()
    expect(goals()).toBe('Return visits')
    confirm.mockReturnValue(true)
    save.mockResolvedValue({ data: emptySpaceCoachProfile() })
    await act(async () => clear().click())
    expect(save).toHaveBeenCalledExactlyOnceWith('space-A', null)
    expect(goals()).toBe('')
    expect(status()).toBe('Coach preferences cleared.')
  })
  it('does not submit or clear a staff preview, including synthetic form submit', async () => {
    mount(true)
    expect([...host.querySelectorAll('textarea, button')].every((e) => (e as HTMLButtonElement).disabled)).toBe(true)
    await submit()
    expect(save).not.toHaveBeenCalled()
  })
})


it('drops unsaved A notes on keyed tenant navigation and saves only B notes to B', async () => {
  act(() => root.render(<CoachProfileForm key="space-A" spaceId="space-A" initial={{ ...emptySpaceCoachProfile(), goals: 'Original A notes' }} />))
  const area = host.querySelector('#coach-goals') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(area, 'Unsaved private A notes')
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(goals()).toBe('Unsaved private A notes')
  const profileB = { ...emptySpaceCoachProfile(), goals: 'Only B notes' }
  act(() => root.render(<CoachProfileForm key="space-B" spaceId="space-B" initial={profileB} />))
  expect(goals()).toBe('Only B notes')
  expect(host.textContent).not.toContain('Unsaved private A notes')
  save.mockResolvedValue({ data: profileB })
  await submit()
  expect(save).toHaveBeenCalledExactlyOnceWith('space-B', profileB)
  expect(JSON.stringify(save.mock.calls)).not.toContain('private A')
})
