'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import {
  connectCalendar,
  disconnectCalendar,
  readCalendarSyncStatus,
  syncCalendarNow,
  type CalendarSyncStatus,
} from './calendar-sync-actions'

// TWO-WAY SYNC (LIVE-1179, ADR-1976). The design lists Google, Apple, Outlook and Notion under
// "Sync and feeds". Each row now says what is true for it:
//   Google   built, behind CALENDAR_SYNC_ENABLED. With the switch on and the Google client set, the
//            Space's owner or an admin gets a real Connect button, Sync now, Disconnect, and the
//            conflicts the last sync found, each with its two answers.
//   Outlook  not built yet; the feed covers it today.
//   Apple    has no way for another app to connect to iCloud calendars, so the feed IS the answer.
//   Notion   Notion Calendar reads Google calendars, so connecting Google is the answer.
// The status is read when this sheet opens (a server action), so the calendar page itself pays
// nothing for it, and nothing at all while the switch is off.

const RETURN_LINES: Record<string, string> = {
  connected: 'Google Calendar is connected and the first sync ran.',
  cancelled: 'Nothing was connected. Google said no, or the screen was closed.',
  expired: 'That connect link ran out. Start again from here.',
  failed: 'Google did not finish the connection. Try again in a moment.',
  unavailable: 'Calendar sync is not switched on yet.',
}

function when(iso: string | null): string {
  if (!iso) return 'not yet'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'not yet' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function Row({ name, note, children }: { name: string; note: string; children?: React.ReactNode }) {
  return (
    <li className="space-y-2 px-4 py-3">
      <span className="block text-body-sm font-medium text-text">{name}</span>
      <span className="block text-meta text-muted">{note}</span>
      {children}
    </li>
  )
}

function GoogleRow({ slug }: { slug: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<CalendarSyncStatus | null>(null)
  // The OAuth callback comes back with ?sync=<word>; say what happened once, in plain words. The
  // settings sheet only opens on a press, so this never runs on the server.
  const [line, setLine] = useState<{ text: string; tone: 'muted' | 'danger' } | null>(() => {
    const back = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('sync')
    return back && RETURN_LINES[back] ? { text: RETURN_LINES[back], tone: back === 'connected' ? 'muted' : 'danger' } : null
  })
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => readCalendarSyncStatus(slug).then(setStatus).catch(() => setStatus(null)), [slug])
  useEffect(() => {
    void load()
  }, [load])

  const run = (work: () => Promise<{ text: string; tone: 'muted' | 'danger' } | null>) =>
    startTransition(async () => {
      const next = await work()
      if (next) setLine(next)
      await load()
      router.refresh()
    })

  const connect = () =>
    startTransition(async () => {
      const res = await connectCalendar(slug, 'google')
      if (isError(res)) setLine({ text: res.error, tone: 'danger' })
      else window.location.assign(res.data.url)
    })

  const sync = (answer?: { eventId: string; keep: 'ours' | 'theirs' }) =>
    run(async () => {
      const res = await syncCalendarNow(slug, 'google', answer)
      if (isError(res)) return { text: res.error, tone: 'danger' }
      const { pushed, busy, conflicts } = res.data
      return {
        text: `Synced. ${pushed} ${pushed === 1 ? 'change' : 'changes'} sent, ${busy} busy ${busy === 1 ? 'time' : 'times'} shown${conflicts ? `, ${conflicts} to look at` : ''}.`,
        tone: 'muted',
      }
    })

  const disconnect = () =>
    run(async () => {
      const res = await disconnectCalendar(slug, 'google')
      return isError(res)
        ? { text: res.error, tone: 'danger' }
        : { text: 'Disconnected. Busy times left this calendar. Copies already in Google Calendar stay there.', tone: 'muted' }
    })

  let body: React.ReactNode
  if (!status) body = <p className="text-meta text-muted">Checking…</p>
  else if (!status.switchedOn || !status.ready) body = <p className="text-meta text-muted">Built, and not switched on yet.</p>
  else if (!status.canManage) body = <p className="text-meta text-muted">The Space owner or an admin can connect this.</p>
  else if (status.state !== 'connected') {
    body = (
      <Button type="button" size="sm" variant="secondary" loading={pending} onClick={connect}>
        Connect Google Calendar
      </Button>
    )
  } else {
    body = (
      <div className="space-y-2">
        <p className="text-meta text-muted">
          Connected{status.calendarLabel ? ` to ${status.calendarLabel}` : ''}. Last synced {when(status.lastSyncedAt)}.
        </p>
        {status.lastError ? <p className="text-meta text-danger">{status.lastError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" loading={pending} onClick={() => sync()}>
            Sync now
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disconnect}>
            Disconnect
          </Button>
        </div>
        {status.conflicts.length > 0 ? (
          <ul className="space-y-2" aria-label="Edits made in Google Calendar">
            {status.conflicts.map((c) => (
              <li key={c.eventId} className="space-y-1 rounded-card border border-border px-3 py-2">
                <span className="block text-body-sm text-text">{c.title}</span>
                <span className="block text-meta text-muted">
                  {c.kind === 'edited_there'
                    ? 'Someone changed this in Google Calendar. We left their change alone.'
                    : 'This was removed here but changed in Google Calendar, so we left it there.'}
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => sync({ eventId: c.eventId, keep: 'ours' })}>
                    Use Frequency&rsquo;s version
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => sync({ eventId: c.eventId, keep: 'theirs' })}>
                    Keep their edit
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <Row name="Google Calendar" note="Your events go out, and your team’s busy times come back as Unavailable.">
      {body}
      {line ? <p className={line.tone === 'danger' ? 'text-meta text-danger' : 'text-meta text-muted'} role="status">{line.text}</p> : null}
    </Row>
  )
}

export function CalendarSyncSoon({ slug }: { slug: string }) {
  return (
    <section aria-labelledby="calendar-sync" className="space-y-2">
      <h3 id="calendar-sync" className="text-body-sm font-semibold text-text">
        Two-way sync
      </h3>
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        <GoogleRow slug={slug} />
        <Row name="Outlook" note="Two-way, for work calendars. Not built yet. The feed above works in Outlook today." />
        <Row
          name="Apple Calendar"
          note="Apple does not let other apps connect to iCloud calendars. Subscribe to a feed above and it stays current on every Apple device."
        />
        <Row name="Notion" note="Notion Calendar shows your Google calendars, so connect Google and your events appear there too." />
      </ul>
      <p className="text-meta text-muted">The feeds above work in any calendar app, connected or not.</p>
    </section>
  )
}
