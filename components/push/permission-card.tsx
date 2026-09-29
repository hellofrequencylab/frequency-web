'use client'

// "Turn on notifications": the one place a member is asked for push permission, and only by a tap
// (LIVE-701, ADR-1629). Two shapes over one state read:
//
//   · PushSettingsCard  always on Settings > Notifications. Says what this device can do and, when
//                       a tap can ask, offers the button.
//   · PushNudge         a one-time card beside a moment that earns it (a Going RSVP, a Circle you
//                       belong to). Shows at most once per device, only when a tap could help, and
//                       "Not now" puts it away for good. Settings stays the way back.
//
// What neither ever does: ask on load (the button's click is the gesture), offer a button on an
// iPhone Safari tab where web push cannot work (it explains the Home Screen step instead), or ask
// again once the browser says denied (the button is gone and enablePushFromTap refuses).

import { useEffect, useState, useSyncExternalStore } from 'react'
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

const NUDGE_COPY = {
  rsvp: 'Want a reminder before it starts?',
  circle: 'Hear from your Circle on this device?',
} as const

/** localStorage key for the one-time nudge. A per-device convenience, never a record. */
export const PUSH_NUDGE_KEY = 'frequency.pushNudge'

type Result = 'idle' | 'working' | 'failed'

const noSubscribe = () => () => {}
const readAvailability = (): PushAvailability =>
  PUBLIC_KEY ? pushAvailability(readPushEnv()) : 'unsupported'

// One state read shared by both shapes. Read through useSyncExternalStore, not an effect: the
// server snapshot is null (render nothing), so the server render and hydration agree, and the
// browser is read only in the browser. Every re-render re-reads it, so after the tap the answer
// the browser now holds (granted, denied) is what renders.
function usePushControl() {
  const availability = useSyncExternalStore(noSubscribe, readAvailability, () => null)
  const [result, setResult] = useState<Result>('idle')

  // Straight from the click: enablePushFromTap asks before its first await, inside the gesture.
  function turnOn() {
    setResult('working')
    void enablePushFromTap(PUBLIC_KEY).then((outcome) => {
      setResult(outcome === 'save-failed' || outcome === 'failed' ? 'failed' : 'idle')
    })
  }

  return { availability, result, turnOn }
}

function Body({
  availability,
  result,
  turnOn,
}: {
  availability: PushAvailability
  result: Result
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
        {availability && <Body availability={availability} result={result} turnOn={turnOn} />}
      </div>
    </section>
  )
}

// The one-time claim. The first eligible PushNudge to mount on a device whose flag is unset takes
// it (from an effect: a write to storage and to this module, never a setState), and only that
// instance renders. The flag makes it once per device across loads; the module owner makes it once
// per load across client navigations.
let nudgeOwner: string | null = null
let nudgeSeq = 0
const nudgeListeners = new Set<() => void>()
function subscribeNudge(listener: () => void) {
  nudgeListeners.add(listener)
  return () => {
    nudgeListeners.delete(listener)
  }
}
function setNudgeOwner(owner: string | null) {
  nudgeOwner = owner
  for (const listener of nudgeListeners) listener()
}

function readNudge(): string | null {
  try {
    return window.localStorage.getItem(PUSH_NUDGE_KEY)
  } catch {
    return null
  }
}

function writeNudge(value: 'shown' | 'dismissed') {
  try {
    window.localStorage.setItem(PUSH_NUDGE_KEY, value)
  } catch {
    // Private mode or blocked storage: the card may show once more on a later load. Harmless.
  }
}

export function PushNudge({
  context,
  className = '',
}: {
  context: keyof typeof NUDGE_COPY
  className?: string
}) {
  const { availability, result, turnOn } = usePushControl()
  const [id] = useState(() => `nudge-${++nudgeSeq}`)
  const open = useSyncExternalStore(subscribeNudge, () => nudgeOwner === id, () => false)

  useEffect(() => {
    if (availability === null || nudgeOwner !== null) return
    // Only when a tap can help (or the Home Screen step can), and only the first time.
    if (availability !== 'askable' && availability !== 'ios-install') return
    if (readNudge() !== null) return
    writeNudge('shown')
    setNudgeOwner(id)
  }, [availability, id])

  if (!open || availability === null) return null
  return (
    <section
      aria-label="Notifications"
      className={`space-y-2 rounded-card border border-border bg-surface-elevated px-4 py-3 ${className}`}
    >
      <p className="text-body-sm font-semibold text-text">{NUDGE_COPY[context]}</p>
      <Body availability={availability} result={result} turnOn={turnOn} />
      <button
        type="button"
        onClick={() => {
          writeNudge('dismissed')
          setNudgeOwner('dismissed')
        }}
        className="text-meta font-medium text-muted underline"
      >
        {availability === 'askable' ? 'Not now' : 'Close'}
      </button>
    </section>
  )
}
