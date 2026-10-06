// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// SCAN-739. Tapping Allow / Join / Post on a Vera proposal used to remove the card and throw the
// server's answer away. confirmProposal returns { ok: false, error } for a member without memory
// consent, a full circle, an unknown handle, and more, each with a reason written for that case;
// the client never read it, so the card vanished as if the write had happened.
//
// The assertion is the CONSEQUENCE on both surfaces (the companion chat and the onboarding
// lightbox): after a refusal the card is back, the server's reason is a Vera bubble inside the
// role="log" live region, and after a success the card is gone and no bubble was added.

const confirmProposal = vi.fn<(tool: string, argsJson: string) => Promise<{ ok: boolean; error?: string }>>()

vi.mock('@/app/onboarding/vera-actions', () => ({
  conciergeTurn: async () => ({ message: '', stage: 'chat', proposals: [], suggestions: [], done: false }),
  confirmProposal: (tool: string, argsJson: string) => confirmProposal(tool, argsJson),
}))

// One turn that offers a single proposal, so the card renders without a network.
vi.mock('@/components/vera/vera-stream', () => ({
  streamConciergeTurn: async () => ({
    message: 'Want me to remember that?',
    stage: 'chat',
    proposals: [{ tool: 'remember_fact', args: { fact: 'I play cello' } }],
    suggestions: [],
    done: false,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}))

import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { VeraLightbox } from '@/components/onboarding/vera-lightbox'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
  document.body.style.overflow = ''
  confirmProposal.mockReset()
})

function mount(node: React.ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
}

function buttons(label: string): HTMLButtonElement[] {
  return [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
}

/** Type a line and send it, so the mocked turn offers its proposal. */
async function askForAProposal() {
  const input = document.body.querySelector('input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, 'I play cello')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(buttons('Allow'), 'the mocked turn did not render a proposal card').toHaveLength(1)
}

async function tapAllow() {
  await act(async () => {
    buttons('Allow')[0].click()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function transcript(): HTMLElement {
  return document.body.querySelector('[role="log"]') as HTMLElement
}

const surfaces: Array<[string, () => React.ReactNode]> = [
  ['the companion chat', () => <VeraChat opening={COMPANION_OPENING} />],
  [
    'the onboarding lightbox',
    () => <VeraLightbox slides={[]} opening={{ message: 'Picking up.', suggestions: [], stage: 'orient' }} startInChat />,
  ],
]

describe.each(surfaces)('a refused Vera proposal on %s (SCAN-739)', (_name, render) => {
  it('puts the card back and says why, inside the live region', async () => {
    confirmProposal.mockResolvedValue({ ok: false, error: 'Vera-memory consent is off, so nothing was saved.' })
    mount(render())
    await askForAProposal()

    await tapAllow()

    expect(confirmProposal).toHaveBeenCalledWith('remember_fact', JSON.stringify({ fact: 'I play cello' }))
    expect(buttons('Allow'), 'the card vanished although the server refused').toHaveLength(1)
    expect(transcript().textContent).toContain('Vera-memory consent is off, so nothing was saved.')
  })

  it('puts the card back with a plain line when the action itself throws', async () => {
    confirmProposal.mockRejectedValue(new Error('boom'))
    mount(render())
    await askForAProposal()

    await tapAllow()

    expect(buttons('Allow')).toHaveLength(1)
    expect(transcript().textContent).toContain('That did not go through. Try again?')
  })

  it('leaves the card gone and the transcript quiet after a success', async () => {
    confirmProposal.mockResolvedValue({ ok: true })
    mount(render())
    await askForAProposal()

    await tapAllow()

    // The card (which lives in the log) is gone, and Vera's offer is still the last thing said.
    expect(buttons('Allow')).toHaveLength(0)
    expect(transcript().textContent?.endsWith('Want me to remember that?')).toBe(true)
  })
})
