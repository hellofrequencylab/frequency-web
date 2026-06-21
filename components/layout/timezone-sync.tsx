'use client'

import { useEffect } from 'react'
import { syncMemberTimezone } from '@/app/(main)/timezone-actions'

// Reports the browser's IANA timezone to the server ONCE on mount so the member's
// durable `profiles.home_timezone` gets populated (the practice-day resolver reads it
// server-side). Renders nothing; the action fills the column only when it's empty, so
// this is a quiet, self-healing one-time sync — a member who never set a home tz stops
// seeing their Log Practice buttons reset at UTC midnight instead of their own.
export function TimezoneSync() {
  useEffect(() => {
    let tz: string | null = null
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      tz = null
    }
    if (tz) void syncMemberTimezone(tz)
  }, [])
  return null
}
