// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('@/app/(marketing)/subscribe/actions', () => ({ requestSubscribe: request }))
vi.mock('./parts', () => ({ FnOutcome: ({ children, title }: { children: React.ReactNode; title: string }) => <div role="status">{title}{children}</div> }))
import { FrequencySubscribeForm } from './subscribe-form'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let host: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); host?.remove(); request.mockReset() })
function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root!.render(<FrequencySubscribeForm />))
}
async function submit() { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }
it('recovers from transport rejection without exposing errors or stranding the submit control', async () => {
  request.mockRejectedValueOnce(new Error('secret provider internals')).mockResolvedValueOnce({ ok: true })
  mount(); await submit()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Please try again')
  expect(host.textContent).not.toContain('secret provider')
  expect(host.querySelector('button')?.disabled).toBe(false)
  await submit()
  expect(request).toHaveBeenCalledTimes(2)
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Check your inbox')
  expect(host.querySelector('[role="alert"]')).toBeNull()
})
it('keeps the pending control disabled until the real request settles', async () => {
  let resolve!: (value: { ok: boolean; error?: string }) => void
  request.mockImplementation(() => new Promise(r => { resolve = r }))
  mount(); await submit()
  expect(host.querySelector('button')?.disabled).toBe(true)
  await act(async () => { resolve({ ok: false, error: 'Please check your email address.' }) })
  expect(host.querySelector('button')?.disabled).toBe(false)
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Please check your email address.')
})
