import { getCrewContext } from '@/lib/quest/crew-context'
import { getPracticesToLogToday } from '@/lib/practices'
import { HubPrimaryCta } from '@/app/(main)/crew/hub-primary-cta'

// My Quest layout module (ADR-270/294): the one dominant primary action — "Log a practice".
// This is a practice app, so logging is the move. Split out of the season map so it can be
// reordered or hidden on its own from Settings → Layout. On a phone the CTA pins to the thumb
// zone just above the mobile bottom nav (HubPrimaryCta); on md and up it stays in-flow.
// Self-fetching RSC keyed to the signed-in member via getCrewContext (request-cached);
// renders nothing when there is no viewer.
export async function QuestCta() {
  const ctx = await getCrewContext()
  if (!ctx) return null

  const practicesToLog = await getPracticesToLogToday(ctx.profileId)
  const hasPracticeToLog = practicesToLog.length > 0

  return <HubPrimaryCta href="/practices" label={hasPracticeToLog ? 'Log a practice' : 'See your practices'} />
}
