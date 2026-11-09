import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { SITE_URL } from '@/lib/site'
import { CalendarSubscribeMenu } from './calendar-subscribe-menu'

// "Subscribe to calendar" affordance for the events library (Events B-4).
//
// Server component: get-or-creates the member's stable feed token via the
// ensure_calendar_token RPC (runs through the SESSION client so it's the caller's
// own row, RLS-enforced), builds the subscribe URL, and hands it to a small client
// menu for the copy / Google / Apple actions. Renders nothing for signed-out
// visitors. The URL is a per-member secret, so we never log or expose it elsewhere.
export async function CalendarSubscribe({ buttonClassName }: { buttonClassName?: string } = {}) {
  // Signed-out first (visual sweep 2026-11-03): ensure_calendar_token is authenticated-only
  // (20270304000000), so every anonymous /events render was one round trip that ended in a
  // "permission denied for function ensure_calendar_token" ERROR in the Postgres log, several a
  // minute under crawl. The cached user read is already paid for by the page.
  if (!(await getCachedUser())) return null
  const supabase = (await createClient())
  const { data: token, error } = await supabase.rpc('ensure_calendar_token')
  if (error || !token || typeof token !== 'string') return null

  // The app URL the calendar app polls. Calendar clients want the webcal:// scheme
  // to recognise it as a subscription rather than a one-off download.
  const httpsUrl = `${SITE_URL}/events/calendar/${token}`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  return <CalendarSubscribeMenu httpsUrl={httpsUrl} webcalUrl={webcalUrl} buttonClassName={buttonClassName} />
}
