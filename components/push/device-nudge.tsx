'use client'

// The ONE one-time card beside a moment that earns it: a Going RSVP, a post, a Circle you belong to
// (LIVE-703, ADR-1630; it replaces LIVE-701's push-only card). It can carry two asks, and never
// shows as two cards:
//
//   · install  after an RSVP or a post only, never on a first visit, once per device. Android and
//              other Chromium browsers get the "Install the app" button (the browser's own prompt,
//              fired by the tap); iPhone and iPad get the Share, Add to Home Screen steps.
//   · push     "Turn on notifications", when a tap can ask, once per device (LIVE-701's rules).
//
// On an iPhone Safari tab the two asks are the same step: web push works there only from the Home
// Screen. So that card is the install card, it says notifications work from there too, and it
// follows the install rules. Which half shows is decided by nudgeOffer (install.ts), a pure
// function, and the first eligible card on a load claims the slot: one card per load, per device.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { PUSH_NUDGE_KEY, PushBody, usePushControl } from './permission-card'
import { InstallBody, useInstallControl } from './install-card'
import { nudgeOffer, readFirstVisit, type NudgeContext, type NudgeOffer } from './install'

/** localStorage key for the one-time install card. A per-device convenience, never a record. */
export const INSTALL_NUDGE_KEY = 'frequency.installNudge'

export const NUDGE_HEADINGS = {
  push: {
    rsvp: 'Want a reminder before it starts?',
    post: 'Hear from Frequency on this device?',
    circle: 'Hear from your Circle on this device?',
  },
  install: {
    prompt: 'Keep Frequency on your home screen',
    'ios-steps': 'Add Frequency to your Home Screen',
  },
} as const

// The one-time claim. The first eligible DeviceNudge to mount takes it (from an effect: a write to
// storage and to this module, never a setState), and only that instance renders. The storage flags
// make it once per device across loads; the module claim makes it one card per load across client
// navigations, so an RSVP card and a Circle card can never stack.
interface Claim {
  owner: string
  offer: NudgeOffer | null
}
let claim: Claim | null = null
let seq = 0
const listeners = new Set<() => void>()
function subscribeClaim(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function setClaim(next: Claim) {
  claim = next
  for (const listener of listeners) listener()
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: 'shown' | 'dismissed') {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the card may show once more on a later load. Harmless.
  }
}

function flagsFor(offer: NudgeOffer): string[] {
  const keys: string[] = []
  if (offer.install) keys.push(INSTALL_NUDGE_KEY)
  if (offer.push) keys.push(PUSH_NUDGE_KEY)
  return keys
}

export function DeviceNudge({ context, className = '' }: { context: NudgeContext; className?: string }) {
  const push = usePushControl()
  const inst = useInstallControl()
  const [id] = useState(() => `device-nudge-${++seq}`)
  const mine = useSyncExternalStore(
    subscribeClaim,
    () => (claim?.owner === id ? claim.offer : null),
    () => null,
  )

  useEffect(() => {
    if (push.availability === null || inst.availability === null || claim !== null) return
    const offer = nudgeOffer({
      context,
      push: push.availability,
      install: inst.availability,
      firstVisit: readFirstVisit(),
      pushSeen: readFlag(PUSH_NUDGE_KEY) !== null,
      installSeen: readFlag(INSTALL_NUDGE_KEY) !== null,
    })
    if (!offer) return
    for (const key of flagsFor(offer)) writeFlag(key, 'shown')
    setClaim({ owner: id, offer })
  }, [context, push.availability, inst.availability, id])

  if (!mine || push.availability === null || inst.availability === null) return null
  const offer = mine
  const heading = offer.install ? NUDGE_HEADINGS.install[offer.install] : NUDGE_HEADINGS.push[context]
  // "Not now" while a button is still on the card; "Close" when all it shows is steps or a result.
  const actionable =
    (offer.push && push.availability === 'askable') ||
    (offer.install === 'prompt' && inst.availability === 'prompt' && inst.result === 'idle')

  return (
    <section
      aria-label={offer.install ? 'Install the app' : 'Notifications'}
      className={`space-y-3 rounded-card border border-border bg-surface-elevated px-4 py-3 ${className}`}
    >
      <p className="text-body-sm font-semibold text-text">{heading}</p>
      {offer.install && (
        <InstallBody
          availability={inst.availability}
          result={inst.result}
          install={inst.install}
          withPush={offer.install === 'ios-steps'}
        />
      )}
      {offer.push && (
        <div className={offer.install ? 'border-t border-border pt-3' : ''}>
          <PushBody availability={push.availability} result={push.result} turnOn={push.turnOn} />
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          for (const key of flagsFor(offer)) writeFlag(key, 'dismissed')
          setClaim({ owner: 'dismissed', offer: null })
        }}
        className="text-meta font-medium text-muted underline"
      >
        {actionable ? 'Not now' : 'Close'}
      </button>
    </section>
  )
}
