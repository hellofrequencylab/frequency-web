'use client'

// "Turn on notifications": the one place a member is asked for push permission, and only by a tap
// (LIVE-701, ADR-1629). Two shapes over one state read:
//
//   · PushSettingsCard  always on Settings > Notifications. Says what this device can do and, when
//                       a tap can ask, offers the button.
//   · DeviceNudge       (device-nudge.tsx, LIVE-703) the one-time card beside a moment that earns
//                       it (a Going RSVP, a post, a Circle you belong to). It carries this ask and
//                       the install ask in ONE card, and renders PushBody for the push half.
//
// What neither ever does: ask on load (the button's click is the gesture), offer a button on an
// iPhone Safari tab where web push cannot work (it explains the Home Screen step instead), or ask
// again once the browser says denied (the button is gone and enablePushFromTap refuses).

import { useState, useSyncExternalStore } from 'react'
import { BellRing, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pushAvailability, readPushEnv, type PushAvailability } from './availability'
import { PUSH_SAVE_FAILED_COPY, enablePushFromTap } from './subscribe'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export const PUSH_COPY = {
  button: 'Turn on notifications',
  askable:
    'Get event reminders, updates from your hosts, and Circle check-ins on this device. Your browser will ask you to confirm.',
  on: 'Notifications are on for this device.',
  denied:
    'Notifications are blocked for Frequency in this browser. To get them, allow notifications for this site in your browser settings.',
  iosInstall:
    'On iPhone and iPad, notifications only work from the Home Screen. Tap Share, choose Add to Home Screen, then open Frequency from there and turn them on.',
  unsupported: 'This browser cannot show notifications. Email still reaches you.',
  failed: PUSH_SAVE_FAILED_COPY,
} as const

/** localStorage key for the one-time push card. A per-device convenience, never a record. */
export const PUSH_NUDGE_KEY = 'frequency.pushNudge'

export type PushResult = 'idle' | 'working' | 'failed'

const noSubscribe = () => () => {}
const readAvailability = (): PushAvailability =>
  PUBLIC_KEY ? pushAvailability(readPushEnv()) : 'unsupported'

// One state read shared by both shapes. Read through useSyncExternalStore, not an effect: the
// server snapshot is null (render nothing), so the server render and hydration agree, and the
// browser is read only in the browser. Every re-render re-reads it, so after the tap the answer
// the browser now holds (granted, denied) is what renders.
export function usePushControl() {
  const availability = useSyncExternalStore(noSubscribe, readAvailability, () => null)
  const [result, setResult] = useState<PushResult>('idle')

  // Straight from the click: enablePushFromTap asks before its first await, inside the gesture.
  function turnOn() {
    setResult('working')
    void enablePushFromTap(PUBLIC_KEY).then((outcome) => {
      setResult(outcome === 'save-failed' || outcome === 'failed' ? 'failed' : 'idle')
    })
  }

  return { availability, result, turnOn }
}

export function PushBody({
  availability,
  result,
  turnOn,
}: {
  availability: PushAvailability
  result: PushResult
  turnOn: () => void
}) {
  if (availability === 'ios-install') return <p className="text-body-sm text-muted">{PUSH_COPY.iosInstall}</p>
  if (availability === 'unsupported') return <p className="text-body-sm text-muted">{PUSH_COPY.unsupported}</p>
  if (availability === 'denied') return <p className="text-body-sm text-muted">{PUSH_COPY.denied}</p>
  if (availability === 'granted' && result !== 'failed') {
    return (
      <p className="flex items-center gap-1.5 text-body-sm text-success">
        <Check className="h-4 w-4" /> {PUSH_COPY.on}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {availability === 'askable' && <p className="text-body-sm text-muted">{PUSH_COPY.askable}</p>}
      {result === 'failed' && (
        <p role="status" className="text-meta text-danger">
          {PUSH_COPY.failed}
        </p>
      )}
      <Button type="button" size="sm" onClick={turnOn} loading={result === 'working'}>
        <BellRing className="h-4 w-4" />
        {PUSH_COPY.button}
      </Button>
    </div>
  )
}

export function PushSettingsCard() {
  const { availability, result, turnOn } = usePushControl()
  return (
    <section
      aria-label="Notifications on this device"
      className="mt-6 overflow-hidden rounded-card border border-border bg-surface lift-1"
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3">
        <BellRing className="h-4 w-4 text-muted" />
        <span className="text-body-sm font-semibold text-text">Notifications on this device</span>
      </div>
      <div className="px-4 py-4">
        {availability && <PushBody availability={availability} result={result} turnOn={turnOn} />}
      </div>
    </section>
  )
}
