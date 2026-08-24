// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { findA11yViolations, formatViolations } from './axe'

// LIVE-016 — Vera's chat transcript must be a LIVE REGION, or her reply lands in a scroll
// container nobody's focus is in and a screen-reader user is told nothing at all.
//
// WHAT SHAPE THE STREAM IS, because it decides the ARIA:
// every Vera surface goes through `conciergeTurn` (app/onboarding/vera-actions.ts), a server
// action that is awaited ONCE and returns the WHOLE reply string. The transcript appends it in a
// single `setMessages`. There is no token-by-token stream, no ReadableStream, no delta path — so
// `polite` is correct and there is no per-token machine-gun to defend against.
//
// The defence is asserted anyway, because the failure mode a future streaming rewrite would
// introduce is silent: `aria-relevant="additions"` means only ADDED nodes are spoken (never a
// re-read of the whole thread, never in-place text mutation — which is exactly what token
// streaming produces), and `aria-atomic` must not be "true" or every reply re-reads the entire
// transcript. Both are load-bearing, so both are asserted.
//
// The composer is asserted to be OUTSIDE the region: a live region that contains the text input
// makes a screen reader narrate the member back to themselves as they type.

vi.mock('@/app/onboarding/vera-actions', () => ({
  conciergeTurn: async () => ({ message: '', stage: 'chat', proposals: [], suggestions: [], done: false }),
  confirmProposal: async () => ({ ok: true }),
}))

// The lightbox is a dialog that owns the URL, so the router it reaches for is stubbed rather
// than mounted — nothing in this file navigates.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}))

import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { VeraLightbox } from '@/components/onboarding/vera-lightbox'

/** Mount static markup into the document and hand back the container. */
function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

/**
 * The one assertion that matters: the element holding the message bubbles announces its own
 * additions. `text` is a phrase from Vera's opening line, so this finds the transcript by the
 * CONSEQUENCE (the node a reply is appended into) rather than by a class name or a test id.
 */
function assertTranscriptIsALiveRegion(host: HTMLElement, text: string) {
  const bubble = [...host.querySelectorAll('*')].findLast(
    (el) => el.textContent?.includes(text) && !el.querySelector('*'),
  )
  expect(bubble, `no rendered bubble contained ${JSON.stringify(text)}`).toBeTruthy()

  // Walk up from the bubble to the nearest live region. `closest()` on the polite/log
  // combination is what a screen reader effectively does to decide whether to speak.
  const region = bubble!.closest('[aria-live], [role="log"], [role="status"], [role="alert"]')
  expect(
    region,
    'Vera appended a reply into a container with no live region above it, so a screen-reader user is never told she answered',
  ).toBeTruthy()

  expect(region!.getAttribute('role')).toBe('log')
  expect(region!.getAttribute('aria-live')).toBe('polite')

  // Only ADDED nodes are news. "text"/"all" would re-speak on in-place mutation, which is the
  // token-streaming machine-gun; "removals" would speak when the thread is cleared.
  expect(region!.getAttribute('aria-relevant')).toBe('additions')

  // Non-atomic, or every reply re-reads the entire conversation from the top.
  expect(region!.getAttribute('aria-atomic')).not.toBe('true')

  // A live region with no accessible name is an unlabelled announcement source.
  expect(region!.getAttribute('aria-label')?.trim()).toBeTruthy()

  // The composer must not live inside the region.
  expect(
    region!.querySelector('input, textarea'),
    'the composer sits inside the live region, so a screen reader narrates the member back to themselves as they type',
  ).toBeNull()

  return region!
}

describe('Vera transcript is a live region (LIVE-016)', () => {
  it('the companion transcript announces Vera’s replies', async () => {
    const host = mount(renderToStaticMarkup(<VeraChat opening={COMPANION_OPENING} />))
    try {
      assertTranscriptIsALiveRegion(host, 'I keep this place running')
    } finally {
      host.remove()
    }
  })

  // The onboarding CONCIERGE case was removed on 2026-08-24 with the component it mounted.
  // LIVE-071 retired the standalone /onboarding/vera page and VeraConcierge, its only consumer,
  // because nothing had linked that page since ADR-081 moved Vera into the feed lightbox in June.
  // The LIVE-016 guarantee is unchanged for the two surfaces a member can still reach — the
  // companion transcript above and the onboarding lightbox below — and both are still asserted.

  it('the onboarding lightbox transcript announces Vera’s replies', async () => {
    const opening = { message: 'Picking up where induction left off.', suggestions: ['Find me a Circle'], stage: 'orient' as const }
    const host = mount(renderToStaticMarkup(<VeraLightbox slides={[]} opening={opening} startInChat />))
    try {
      assertTranscriptIsALiveRegion(host, 'Picking up where induction left off.')
    } finally {
      host.remove()
    }
  })

  it('the transcript region is valid ARIA', async () => {
    const violations = await findA11yViolations(<VeraChat opening={COMPANION_OPENING} />)
    expect(formatViolations(violations)).toBe('')
  })
})
