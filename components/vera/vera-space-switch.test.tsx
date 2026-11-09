// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// LIVE-2157. Vera proposes turning one area of a Space on or off; the card carries the server's own words
// (the page never ships the Space catalog), the button says what it does, and once the change lands Vera
// says so in the log, with where to switch it back.

const confirmProposal = vi.fn<(tool: string, argsJson: string) => Promise<{ ok: boolean; error?: string; message?: string }>>()

vi.mock('@/app/onboarding/vera-actions', () => ({
  conciergeTurn: async () => ({ message: '', stage: 'chat', proposals: [], suggestions: [], done: false }),
  confirmProposal: (tool: string, argsJson: string) => confirmProposal(tool, argsJson),
}))

vi.mock('@/components/vera/vera-stream', () => ({
  streamConciergeTurn: async () => ({
    message: 'I can turn Reviews off for you.',
    stage: 'chat',
    proposals: [{ tool: 'set_space_feature', args: { space: 'sunrise', feature: 'reviews', on: false }, label: 'Turn Reviews off in this Space?' }],
    suggestions: [],
    done: false,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}))

import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
  confirmProposal.mockReset()
})

const buttons = (label: string) => [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)

describe('Vera proposes a Space switch on a card (LIVE-2157)', () => {
  it('shows the server words, changes nothing until tapped, then says it is done and where to switch back', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(<VeraChat opening={COMPANION_OPENING} />))

    const input = document.body.querySelector('input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, 'turn off reviews')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('Turn Reviews off in this Space?')
    expect(confirmProposal).not.toHaveBeenCalled()
    const change = buttons('Change it')
    expect(change).toHaveLength(1)

    confirmProposal.mockResolvedValue({ ok: true, message: 'Done. Reviews is off. You can switch it back any time at /spaces/sunrise/manage/modules.' })
    await act(async () => {
      change[0].click()
    })
    expect(confirmProposal).toHaveBeenCalledWith('set_space_feature', JSON.stringify({ space: 'sunrise', feature: 'reviews', on: false }))
    expect(buttons('Change it')).toHaveLength(0)
    expect(document.body.querySelector('[role="log"]')?.textContent).toContain('Done. Reviews is off.')
  })
})
