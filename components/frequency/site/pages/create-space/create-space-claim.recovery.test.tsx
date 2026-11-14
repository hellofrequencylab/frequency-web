// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ email: vi.fn(), google: vi.fn(), signedIn: vi.fn() }))
vi.mock('@/app/(marketing)/create-a-space/actions', () => ({ claimWithEmail: io.email, claimWithGoogle: io.google, continueSignedIn: io.signedIn }))
vi.mock('@/lib/create-space/lead', async (original) => ({ ...(await original<object>()), browserZone: () => 'America/Los_Angeles' }))
import { SaveCard } from './create-space-claim'
import { DRAFT_KEY, emptyDraft } from '@/lib/create-space/builder'
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = '' })
const draft = { ...emptyDraft('new-world', true), name: 'Sample Studio', email: 'owner@example.com' }
async function mount(signedIn = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn, profile: { display_name: 'Owner' } }) }))
  io.email.mockResolvedValue({ ok: false, error: 'Fixture: held before sign-in' }); io.signedIn.mockResolvedValue({ ok: false, error: 'Fixture: held before redirect' })
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el)
  const handOver = vi.fn(() => localStorage.removeItem(DRAFT_KEY))
  await act(async () => root.render(<SaveCard draft={draft} handle="sample" siteName="Sample Studio" kitLabel="New World" coverSrc="/sites/new-world/photos/beach-joy.webp" trapped={false} onHandOver={handOver} onSaved={vi.fn()} onNeedEmail={vi.fn()} />))
  return { el, root, handOver }
}
describe('claim recovery and timezone handover', () => {
  it('keeps the local recovery copy when the native Google form is submitted', async () => {
    const { el, root, handOver } = await mount()
    try {
      localStorage.setItem(DRAFT_KEY, 'local recovery copy')
      await act(async () => { const event = new Event('submit', { bubbles: true, cancelable: true }); event.preventDefault(); el.querySelector('form')!.dispatchEvent(event) })
      expect(handOver).not.toHaveBeenCalled()
      expect(localStorage.getItem(DRAFT_KEY)).toBe('local recovery copy')
    } finally { await act(async () => root.unmount()) }
  })
  it('includes the browser timezone in the native Google form', async () => {
    const { el, root } = await mount()
    try { expect(new FormData(el.querySelector('form')!).get('tz')).toBe('America/Los_Angeles') }
    finally { await act(async () => root.unmount()) }
  })
  it('includes the browser timezone in email handover', async () => {
    const { el, root } = await mount()
    try { await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Email my link'))!.click()); expect(io.email.mock.calls.at(-1)![0].get('tz')).toBe('America/Los_Angeles') }
    finally { await act(async () => root.unmount()) }
  })
  it('includes the browser timezone in signed-in handover', async () => {
    const { el, root } = await mount(true)
    try { await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Continue as'))!.click()); expect(io.signedIn.mock.calls.at(-1)![0].get('tz')).toBe('America/Los_Angeles') }
    finally { await act(async () => root.unmount()) }
  })
})
