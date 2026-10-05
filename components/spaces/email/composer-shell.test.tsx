// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// COMPOSER SEND RESET + DRAFT REUSE (SCAN-703). Before this change a successful Send now left the
// subject and body in place and every click created a fresh campaign row, so "click again to be
// sure" sent the whole campaign to every contact twice. Locked here: a failed send keeps the text and
// the SAME draft id (the retry updates it instead of creating another), and a successful send empties
// the form and drops the draft so a second click has nothing to send.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}))
let created = 0
const createSpaceCampaign = vi.fn(async () => ({ ok: true, data: { id: `camp-${++created}` } }))
const updateSpaceCampaign = vi.fn(async () => ({ ok: true }))
const sendSpaceCampaign = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; error?: string }>>()
vi.mock('@/lib/spaces/campaigns-actions', () => ({
  createSpaceCampaign: (...a: unknown[]) => createSpaceCampaign(...(a as [])),
  updateSpaceCampaign: (...a: unknown[]) => updateSpaceCampaign(...(a as [])),
  scheduleSpaceCampaign: vi.fn(async () => ({ ok: true })),
  sendSpaceCampaign: (...a: unknown[]) => sendSpaceCampaign(...a),
  countSpaceAudience: async () => 3,
}))
vi.mock('@/lib/spaces/segments-actions', () => ({
  createSpaceSegment: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  updateSpaceSegment: vi.fn(async () => ({ ok: true })),
  deleteSpaceSegment: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/spaces/email-templates-actions', () => ({
  createSpaceEmailTemplate: vi.fn(async () => ({ ok: true, data: { id: 'x' } })),
  updateSpaceEmailTemplate: vi.fn(async () => ({ ok: true })),
  deleteSpaceEmailTemplate: vi.fn(async () => ({ ok: true })),
}))

const { ComposerShell } = await import('./composer-shell')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

async function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function sendButton() {
  return Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.includes('Send now'))!
}

async function fillAndClickSend() {
  await act(async () => setValue(container!.querySelector<HTMLInputElement>('#campaign-subject')!, 'Hello'))
  await act(async () => setValue(container!.querySelector<HTMLTextAreaElement>('#campaign-body')!, 'Body text'))
  // Let the audience count resolve so the button is enabled.
  await act(async () => {
    await Promise.resolve()
  })
  expect(sendButton().disabled).toBe(false)
  await act(async () => sendButton().click())
  await act(async () => {
    await Promise.resolve()
  })
}

describe('ComposerShell send (SCAN-703)', () => {
  it('reuses one draft across a failed send and empties the form after a successful one', async () => {
    sendSpaceCampaign
      .mockResolvedValueOnce({ ok: false, error: 'No one matches that audience yet.' })
      .mockResolvedValue({ ok: true })
    await render(<ComposerShell spaceId="space-A" slug="river-studio" tags={[]} canSend />)

    await fillAndClickSend()
    // First click: one create, then a failed send. The text stays so the owner can retry.
    expect(createSpaceCampaign).toHaveBeenCalledTimes(1)
    expect(container!.textContent).toContain('No one matches that audience yet.')
    expect(container!.querySelector<HTMLInputElement>('#campaign-subject')!.value).toBe('Hello')

    await act(async () => sendButton().click())
    await act(async () => {
      await Promise.resolve()
    })
    // Retry: no second row. The same id is updated and sent.
    expect(createSpaceCampaign).toHaveBeenCalledTimes(1)
    expect(updateSpaceCampaign).toHaveBeenCalledWith('space-A', 'river-studio', 'camp-1', {
      subject: 'Hello',
      body: 'Body text',
      topic: expect.any(String),
    })
    expect(sendSpaceCampaign).toHaveBeenLastCalledWith('space-A', 'river-studio', 'camp-1', expect.anything())

    // Success: the notice shows, the form is empty, and Send now is off (nothing to send twice).
    expect(container!.textContent).toContain('Your campaign is on its way.')
    expect(container!.querySelector<HTMLInputElement>('#campaign-subject')!.value).toBe('')
    expect(container!.querySelector<HTMLTextAreaElement>('#campaign-body')!.value).toBe('')
    expect(sendButton().disabled).toBe(true)
  })
})
