'use client'

import { useSyncExternalStore } from 'react'

// A STORED INSTANT IN THE VIEWER'S ZONE (SCAN-702). The campaign list is a server component, and a
// server has no idea what zone the owner is reading from: formatting scheduled_for there printed
// UTC, so the one place an owner could have noticed a wrong-hour schedule showed the wrong hour too.
// This leaf formats the instant with the browser's own Intl. useSyncExternalStore gives React the
// sanctioned two readings: the server snapshot (UTC, labelled, so the first paint is honest) for
// render and hydration, then the client snapshot (the viewer's zone) one commit later.

const OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

/** The server-side reading: the same digits in UTC, labelled, so nothing is ever read as local by mistake. */
export function formatWhenUtc(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${new Intl.DateTimeFormat('en-US', { ...OPTS, timeZone: 'UTC' }).format(d)} UTC`
}

/** The viewer's reading: the same instant in the browser's own zone. Falls back to the UTC reading. */
export function formatWhenLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(undefined, OPTS).format(d)
  } catch {
    return formatWhenUtc(iso)
  }
}

const subscribeNever = () => () => {}

export function LocalWhen({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribeNever,
    () => formatWhenLocal(iso),
    () => formatWhenUtc(iso),
  )
  return <time dateTime={iso}>{text}</time>
}
