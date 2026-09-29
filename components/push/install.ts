// "Install the app": what this browser can do about installing Frequency, and when a card may offer
// it (LIVE-703, ADR-1630). The decisions are pure functions so they are cheap to test and to probe;
// the browser readers below them are thin.
//
// The owner's ruling ("After first RSVP", 2026-09-29): offer installing after a member's first RSVP
// or first post, and keep a permanent "Install the app" option in Settings. Never on a first visit.
// Android and other Chromium browsers use the browser's own install prompt, fired from a tap; iPhone
// and iPad get the Share, Add to Home Screen steps (Safari has no install prompt to fire).
//
// It reuses LIVE-701's read of the browser (components/push/availability.ts): the same iOS and
// Home Screen detection decides both "can push work here" and "can this be installed here", which
// is why one card can carry both asks.

import { readPushEnv, type PushAvailability, type PushEnv } from './availability'
import {
  FIRST_SEEN_KEY,
  FIRST_VISIT_KEY,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_PROP,
} from '@/lib/pwa/install-capture'

//   · 'installed'  opened from the Home Screen or as an installed app. Nothing to offer.
//   · 'prompt'     a Chromium browser handed us its install prompt (captured by the head script).
//                  A TAP fires it; nothing else may, and the browser refuses one without a gesture.
//   · 'ios-steps'  iPhone or iPad in a browser tab. There is no prompt to fire (iOS never hands
//                  one over), so the card shows the Share, Add to Home Screen steps.
//   · 'none'       any other browser, or one that already installed Frequency (Chromium stops
//                  firing the prompt once it is installed). No button.
export type InstallAvailability = 'installed' | 'prompt' | 'ios-steps' | 'none'

export function installAvailability(
  env: Pick<PushEnv, 'isIos' | 'isStandalone'>,
  hasPrompt: boolean,
): InstallAvailability {
  if (env.isStandalone) return 'installed'
  if (env.isIos) return 'ios-steps'
  if (hasPrompt) return 'prompt'
  return 'none'
}

/** A device's first visit lasts for the browser session that first loaded Frequency, capped. */
export const FIRST_VISIT_MS = 12 * 60 * 60 * 1000

/**
 * True while this is the device's first visit: no first-seen stamp at all (storage blocked, or the
 * head script has not run), or the session that wrote the stamp, within FIRST_VISIT_MS of it. Errs
 * toward "first visit", which only ever hides an offer.
 */
export function isFirstVisit(firstSeen: string | null, sessionFlag: string | null, now: number): boolean {
  const seen = Number(firstSeen)
  if (!firstSeen || !Number.isFinite(seen)) return true
  return sessionFlag === '1' && now - seen < FIRST_VISIT_MS
}

/** Where a one-time card can appear. Installing is offered only after an RSVP or a post. */
export type NudgeContext = 'rsvp' | 'post' | 'circle'
export const INSTALL_CONTEXTS: readonly NudgeContext[] = ['rsvp', 'post']

export interface NudgeInput {
  context: NudgeContext
  push: PushAvailability
  install: InstallAvailability
  firstVisit: boolean
  /** The one-time push card already showed on this device. */
  pushSeen: boolean
  /** The one-time install card already showed on this device. */
  installSeen: boolean
}

export interface NudgeOffer {
  install: 'prompt' | 'ios-steps' | null
  push: boolean
}

/**
 * What the one card beside an RSVP, a post or a Circle offers, or null for no card.
 *
 *   · install: only after an RSVP or a post, never on a first visit, once per device, and only
 *     where installing can happen ('prompt' or 'ios-steps').
 *   · push: when a tap can ask ('askable'), once per device. An iPhone Safari tab reads push as
 *     'ios-install', which is not askable: there the install steps ARE the way to notifications, so
 *     the install half carries it and obeys the install rules (no first visit, no Circle).
 */
export function nudgeOffer(i: NudgeInput): NudgeOffer | null {
  const canInstall = i.install === 'prompt' || i.install === 'ios-steps'
  const install =
    canInstall && INSTALL_CONTEXTS.includes(i.context) && !i.firstVisit && !i.installSeen
      ? (i.install as 'prompt' | 'ios-steps')
      : null
  const push = i.push === 'askable' && !i.pushSeen
  if (!install && !push) return null
  return { install, push }
}

// ── Browser side ──────────────────────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PromptHolder = Record<string, InstallPromptEvent | null | undefined>

function heldPrompt(): InstallPromptEvent | null {
  return (window as unknown as PromptHolder)[INSTALL_PROMPT_PROP] ?? null
}

function setHeldPrompt(value: InstallPromptEvent | null) {
  ;(window as unknown as PromptHolder)[INSTALL_PROMPT_PROP] = value
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
}

/** Reads the live browser. Call only after mount (never during a server render). */
export function readInstallAvailability(): InstallAvailability {
  return installAvailability(readPushEnv(), heldPrompt() !== null)
}

/** For useSyncExternalStore: re-read when the head script captures or clears the prompt. */
export function subscribeInstall(listener: () => void): () => void {
  window.addEventListener(INSTALL_PROMPT_EVENT, listener)
  return () => window.removeEventListener(INSTALL_PROMPT_EVENT, listener)
}

export function readFirstVisit(): boolean {
  try {
    return isFirstVisit(
      window.localStorage.getItem(FIRST_SEEN_KEY),
      window.sessionStorage.getItem(FIRST_VISIT_KEY),
      Date.now(),
    )
  } catch {
    return true
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * Call ONLY from a click handler. `prompt()` needs the member's gesture, so it is the first thing
 * awaited. A captured prompt can be shown once, so it is released before it is shown, and every
 * control reading it falls back to its no-prompt state.
 */
export async function promptInstallFromTap(): Promise<InstallOutcome> {
  const event = heldPrompt()
  if (!event) return 'unavailable'
  try {
    const shown = event.prompt()
    setHeldPrompt(null)
    await shown
    const choice = await event.userChoice
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch (e) {
    console.error('[install] the install prompt failed', e)
    return 'unavailable'
  }
}
