// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ progress: vi.fn(async () => ({ ok: true })) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(marketing)/launch-your-business/actions', () => ({ restoreDraft: async () => ({ draft: null }), saveBuilderProgress: io.progress, saveDraftLead: async () => ({ ok: false }), claimWithEmail: vi.fn(), claimWithGoogle: vi.fn(), continueSignedIn: vi.fn() }))
import { CreateSpaceStudio } from './create-space-studio'
import { getOnboardingNicheChoices } from '@/lib/create-space/niche-choices.server'
import { DRAFT_KEY } from '@/lib/create-space/builder'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = '' })
it('persists a niche-only choice to both the browser draft and shared resume before a name is typed', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ signedIn: false }) })))
  io.progress.mockClear()
  localStorage.clear()
  const el = document.createElement('div')
  document.body.append(el)
  const root = createRoot(el)
  try {
    await act(async () => root.render(<CreateSpaceStudio nicheChoices={getOnboardingNicheChoices()} />))
    expect(io.progress).not.toHaveBeenCalled()
    await act(async () => { [...el.querySelectorAll('[role="radio"]')].find((button) => button.textContent === 'Spiritual community')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toMatchObject({ name: '', niche: 'faith', modeHint: 'nonprofit:donations' })
    expect(io.progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'builder', cursor: 0, niche: 'faith', modeHint: 'nonprofit:donations', goals: ['donations'] }))
  } finally { await act(async () => root.unmount()) }
})
