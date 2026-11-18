import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Check, Lock, MapPin } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { ClaimStopForm } from '@/components/hunts/claim-stop-form'
import { FinalePanel } from '@/components/hunts/finale-panel'
import { HuntFundraising } from '@/components/hunts/hunt-fundraising'
import { HuntPlayerSafety } from '@/components/hunts/moderation-screens'
import { TeamPanel } from '@/components/hunts/team-panel'
import { TrailStoreLinks, loadTrailStoreLinks } from '@/components/hunts/trail-store-links'
import { VisitedStops } from '@/components/hunts/visited-stops'
import { VisitedStopsMap } from '@/components/hunts/visited-stops-map'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { projectForPlayer, visitedPins } from '@/lib/hunts/player'
import { loadRallyFinale } from '@/lib/hunts/rally-finale-store'
import { loadLockedMysteries, loadPlayerRun, loadPublishedTrail, loadRunCredits, loadVisitedStopPoints, startOrResumeRun } from '@/lib/hunts/run-store'
import { myTeamPanel } from '@/lib/hunts/team-store'

export const dynamic = 'force-dynamic'

// THE PLAYER PAGE (FH-016): one signed-in member's run on one published Trail. Reading never credits:
// credit goes through the claim path only. The server decides which words leave it (projectForPlayer):
// a locked stop shows its position, an open stop shows its clue without the place, and a visited
// stop shows both. The current stop's optional hint requires an explicit request. The map (FH-016T)
// gets pins for visited stops only: the loader asks for credited stops and `visitedPins` drops the rest.
// The team panel (FH-043S) shows the caller's own Expedition team, never a roster; a team member confirms
// stops for the team's one run, so the solo confirm form steps aside while they are on a team.
// The finale panel (FH-031S) shows a Trail's host Event from the Events tables: places left, the
// player's own seat or why there is none, and a link to the Event. It never claims or holds a seat.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = { title: 'Play a Trail', robots: { index: false } }

export default async function PlayPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ hint?: string | string[]; team?: string | string[] }>
}) {
  const { slug } = await params
  if (!huntSwitchOn('enabled')) notFound()
  const trail = await loadPublishedTrail(slug)
  if (!trail) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${slug}/play`)

  const { hint, team: joinParam } = await searchParams
  const run = hint === undefined ? await startOrResumeRun(trail, profileId) : await loadPlayerRun(trail, profileId)
  const credits = run ? await loadRunCredits(run.runId, profileId) : []
  // FH-042S: a Mystery is kind `answer`. Only the kind is read here; the answer never is.
  const mysteryKeys = new Set(trail.graph.missions.filter((m) => m.kind === 'answer').map((m) => m.mission_key))
  const lockedMysteries = run && mysteryKeys.size > 0 ? await loadLockedMysteries(run.runId, profileId, [...mysteryKeys]) : []
  const view = projectForPlayer({
    lockedMysteries,
    graph: trail.graph,
    content: trail.content,
    credits,
    now: new Date(),
    huntState: trail.huntState,
    revision: trail.revision,
    hints: {
      enabled: huntSwitchOn('claims') && run?.state === 'active',
      requestedKey: typeof hint === 'string' ? hint : undefined,
    },
  })
  const pins = visitedPins(view.stops, run ? await loadVisitedStopPoints(trail, credits) : [])
  const teamsOpen = huntSwitchOn('claims') && trail.huntState === 'published'
  // A failed team read leaves the panel on its start door; every team action checks again on the server.
  const team = teamsOpen ? await myTeamPanel(profileId, slug).catch(() => null) : null
  const joinTeamId = typeof joinParam === 'string' && UUID.test(joinParam) ? joinParam : null
  const canConfirm = huntSwitchOn('claims') && view.canClaim && run?.state === 'active' && !team
  // A failed finale read shows no panel rather than a wrong seat; the Event page stays the authority.
  const finale = run ? await loadRallyFinale(run.runId, profileId, new Date().toISOString()).catch(() => null) : null

  return (
    <FocusTemplate
      eyebrow="Trail"
      title={trail.title}
      description={`${view.progress.done} of ${view.progress.total} stops${view.progress.finished ? '. You finished.' : '.'}`}
      width="default"
    >
      <div className="space-y-4">
        <HuntPlayerSafety banner={view.banner} reportSlug={slug} />
        <ol className="space-y-2">
          {view.stops.map((s) => (
            <li key={s.key} className="flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border text-body-sm font-bold ${
                  s.state === 'credited' ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-elevated text-subtle'
                }`}
                aria-hidden
              >
                {s.state === 'credited' ? <Check className="h-4 w-4" /> : s.state === 'eligible' ? <MapPin className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-text">
                  Stop {s.position}
                  {s.place ? `: ${s.place}` : ''}
                </p>
                {s.clue ? <p className="text-body-sm text-muted">{s.clue}</p> : null}
                {!s.clue ? <p className="text-body-sm text-subtle">Locked for now.</p> : null}
                {s.answerLocked ? <p className="mt-2 text-body-sm text-muted">Out of tries for this question. The stop that stands in for it still counts, so head there next.</p> : null}
                {s.hint ? <p className="mt-2 break-words text-body-sm text-muted">Hint: {s.hint}</p> : null}
                {s.canRevealHint && (
                  <Link
                    href={{ pathname: `/hunts/${encodeURIComponent(slug)}/play`, query: { hint: s.key } }}
                    prefetch={false}
                    className={buttonClasses('secondary', 'md', 'mt-2')}
                  >
                    Show hint
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
        <FinalePanel finale={finale} />
        <VisitedStops stops={view.stops} />
        <TrailStoreLinks links={await loadTrailStoreLinks(trail.huntId)} />
        <VisitedStopsMap pins={pins} />
        {canConfirm && (
          <div className="space-y-3">
            {/* The scanner (components/scan/scanner.tsx) only navigates: a Trail code lands on the confirm step. */}
            <Link href={{ pathname: '/scan', query: { hint: 'trail' } }} prefetch={false} className={buttonClasses('primary', 'md')}>
              Scan the code at this stop
            </Link>
            <ClaimStopForm slug={slug} askAnswer={view.stops.some((st) => st.state === 'eligible' && mysteryKeys.has(st.key) && !st.answerLocked)} />
          </div>
        )}
        {teamsOpen && (
          <TeamPanel
            slug={slug}
            team={team && team.state !== 'disbanded' ? { teamId: team.teamId, name: team.name, state: team.state, captain: team.captain, size: team.size, stopsDone: team.stopsDone } : null}
            joinTeamId={joinTeamId}
          />
        )}
        <HuntFundraising huntId={trail.huntId} />
      </div>
    </FocusTemplate>
  )
}
