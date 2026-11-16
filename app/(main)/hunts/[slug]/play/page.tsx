import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Check, Lock, MapPin } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { ClaimStopForm } from '@/components/hunts/claim-stop-form'
import { HuntFundraising } from '@/components/hunts/hunt-fundraising'
import { HuntPlayerSafety } from '@/components/hunts/moderation-screens'
import { TeamClaimForm, TeamPanel } from '@/components/hunts/team-panel'
import { VisitedStops } from '@/components/hunts/visited-stops'
import { VisitedStopsMap } from '@/components/hunts/visited-stops-map'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { projectForPlayer, visitedPins } from '@/lib/hunts/player'
import { loadPlayerRun, loadPublishedTrail, loadRunCredits, loadVisitedStopPoints, startOrResumeRun } from '@/lib/hunts/run-store'
import { myTeamView } from '@/lib/hunts/team-store'
import { TEAM_LIMITS } from '@/lib/hunts/teams'

export const dynamic = 'force-dynamic'

// THE PLAYER PAGE (FH-016): one signed-in member's run on one published Trail. Reading never credits:
// credit goes through the claim path only. The server decides which words leave it (projectForPlayer):
// a locked stop shows its position, an open stop shows its clue without the place, and a visited
// stop shows both. The current stop's optional hint requires an explicit request. The map (FH-016T)
// gets pins for visited stops only: the loader asks for credited stops and `visitedPins` drops the rest.
// Teams (FH-043S): a member of a locked team plays the team's one run, so the stops, hints, map and
// confirm form read the team run's credits and confirm through the team door. A member of a forming
// team waits for the captain to lock the roster. The panel gets the caller's own team as a count.

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

  const { hint, team: teamLink } = await searchParams
  const teamPlay = huntSwitchOn('claims') ? await myTeamView(profileId, slug) : null
  const team = teamPlay && teamPlay.team.state !== 'disbanded' ? teamPlay.team : null
  const onTeamRun = team?.state === 'locked'
  // A team member never opens a solo run here: the team's run is the one they play.
  const run = team ? null : hint === undefined ? await startOrResumeRun(trail, profileId) : await loadPlayerRun(trail, profileId)
  const credits = onTeamRun ? teamPlay?.credits ?? [] : run ? await loadRunCredits(run.runId, profileId) : []
  const playing = onTeamRun || run?.state === 'active'
  const view = projectForPlayer({
    graph: trail.graph,
    content: trail.content,
    credits,
    now: new Date(),
    huntState: trail.huntState,
    revision: trail.revision,
    hints: {
      enabled: huntSwitchOn('claims') && playing,
      requestedKey: typeof hint === 'string' ? hint : undefined,
    },
  })
  const pins = visitedPins(view.stops, onTeamRun || run ? await loadVisitedStopPoints(trail, credits) : [])
  const canConfirm = huntSwitchOn('claims') && view.canClaim && playing
  const joinTeamId = typeof teamLink === 'string' && UUID.test(teamLink) ? teamLink : null

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
        <VisitedStops stops={view.stops} />
        <VisitedStopsMap pins={pins} />
        {canConfirm && (
          <div className="space-y-3">
            {/* The scanner (components/scan/scanner.tsx) only navigates: a Trail code lands on the confirm step. */}
            <Link href={{ pathname: '/scan', query: { hint: 'trail' } }} prefetch={false} className={buttonClasses('primary', 'md')}>
              Scan the code at this stop
            </Link>
            {onTeamRun ? <TeamClaimForm slug={slug} /> : <ClaimStopForm slug={slug} />}
          </div>
        )}
        {huntSwitchOn('claims') && (
          <TeamPanel
            slug={slug}
            team={team && { teamId: team.teamId, name: team.name, state: team.state, captain: team.captain, size: team.size }}
            progress={onTeamRun ? { done: view.progress.done, total: view.progress.total } : null}
            joinTeamId={joinTeamId}
            limits={{ sizeMax: TEAM_LIMITS.sizeMax, nameMax: TEAM_LIMITS.nameMax }}
          />
        )}
        <HuntFundraising huntId={trail.huntId} />
      </div>
    </FocusTemplate>
  )
}
