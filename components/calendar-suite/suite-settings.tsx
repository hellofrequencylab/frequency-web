'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DayNotesField } from '@/app/(main)/spaces/[slug]/settings/calendar/day-notes-field'
import { CalendarSyncSoon } from '@/app/(main)/spaces/[slug]/settings/calendar/calendar-sync-soon'
import { SkyMarkersField } from '@/app/(main)/spaces/[slug]/settings/calendar/sky-markers-field'
import { SpaceTimeZoneField } from '@/app/(main)/spaces/[slug]/settings/calendar/space-time-zone-field'
import type { DayNote } from '@/lib/calendar/day-notes'
import { SuiteSheet } from './suite-sheet'

// CALENDAR SETTINGS (README 1.8, the gear in the header). One sheet for how this calendar reads and
// where it goes: the Space's time zone, the sky, day notes, the feeds and the sync rows. It is the
// three settings fields the page already had, in the sheet the handoff draws, so each still saves
// through the calendar's own gated action and nothing is written twice. The two copy buttons are the
// handoff's "Copy public feed" and "Copy team feed"; the team link is made on first copy and never
// rotated by copying (rotating stays its own press).

function plans(n: number): string {
  return `${n} shared ${n === 1 ? 'Plan' : 'Plans'}`
}

export function SuiteSettings({
  slug,
  canEdit,
  timeZone,
  skyOn,
  notes,
  publicFeedUrl,
  teamFeedUrl,
  sharedPlans,
  say,
  onClose,
}: {
  slug: string
  canEdit: boolean
  /** The Space's stored zone, or null when it has never said. */
  timeZone: string | null
  skyOn: boolean
  notes: DayNote[]
  publicFeedUrl: string
  /** The team feed's address, made on first ask. Resolves to null when it could not be made. */
  teamFeedUrl: () => Promise<string | null>
  /** Plans this Space shares out or has shared with it. */
  sharedPlans: number
  say: (line: string, tone: 'success' | 'danger' | 'neutral') => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  const copy = async (url: string, done: string) => {
    try {
      await navigator.clipboard.writeText(url)
      say(done, 'success')
    } catch {
      say(`Your browser would not copy it. The link is ${url}`, 'danger')
    }
  }
  const copyTeam = async () => {
    setBusy(true)
    const url = await teamFeedUrl()
    setBusy(false)
    if (!url) {
      say('The team feed could not be made. Try again in a moment.', 'danger')
      return
    }
    await copy(url, 'Private team feed copied. Keep it to your team.')
  }

  return (
    <SuiteSheet title="Calendar settings" line="How this calendar reads and where it goes" onClose={onClose}>
      <div className="cal-settings">
        <section aria-labelledby="cal-set-time">
          <p className="cal-caps" id="cal-set-time">Time</p>
          <SpaceTimeZoneField slug={slug} timeZone={timeZone} canEdit={canEdit} />
        </section>
        <section aria-labelledby="cal-set-sky">
          <p className="cal-caps" id="cal-set-sky">Sky markers</p>
          <SkyMarkersField slug={slug} enabled={skyOn} canEdit={canEdit} />
        </section>
        <section aria-labelledby="cal-set-notes">
          <p className="cal-caps" id="cal-set-notes">Day notes</p>
          <DayNotesField slug={slug} notes={notes} canEdit={canEdit} />
        </section>
        <section aria-labelledby="cal-set-feeds">
          <p className="cal-caps" id="cal-set-feeds">Sync and feeds</p>
          <div className="cal-set-feeds">
            <Button type="button" size="sm" variant="secondary" onClick={() => copy(publicFeedUrl, 'Public feed link copied')}>
              Copy public feed
            </Button>
            {canEdit ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={copyTeam}>
                Copy team feed
              </Button>
            ) : null}
          </div>
          <CalendarSyncSoon />
          <p className="cal-set-line">
            <span>Spaces you plan with</span>
            <span className="cal-as">{plans(sharedPlans)}</span>
          </p>
        </section>
      </div>
    </SuiteSheet>
  )
}
