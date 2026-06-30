'use client'

// A founder-bootstrap action that records the tap before it navigates (Growth OS
// Engine 8, GE8-4 / GE8-6). The "seed a circle / host an event / invite people" choices
// in the founder prompt each fire `recordFounderTap` (best-effort, self-authorized) so
// the global-to-local funnel sees the conversion, then let the underlying link / button
// proceed. The tracking never blocks or alters the navigation.

import { recordFounderTap } from '@/app/(main)/feed/keystone-actions'
import type { FounderAction as FounderActionKind } from '@/lib/keystone/instrumentation'

/** Wraps a founder-prompt CTA so a tap is recorded (fire-and-forget) before it acts. */
export function FounderActionTracker({
  action,
  children,
}: {
  action: FounderActionKind
  children: React.ReactNode
}) {
  return (
    <span
      onClickCapture={() => {
        void recordFounderTap(action)
      }}
    >
      {children}
    </span>
  )
}
