import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Check, Lock, MapPin } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { HuntPlayerSafety } from '@/components/hunts/moderation-screens'
import { FocusTemplate } from '@/components/templates'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { projectForPlayer } from '@/lib/hunts/player'
import { loadPublishedTrail, loadRunCredits, startOrResumeRun } from '@/lib/hunts/run-store'

export const dynamic = 'force-dynamic'

// THE PLAYER PAGE (FH-016): one signed-in member's run on one published Trail. Reading never credits:
// credit goes through the claim path only. The server decides which words leave it (projectForPlayer):
// a locked stop shows its position and an optional teaser, an open stop shows its clue without the
// place, a visited stop shows both. No em dashes.

export const metadata: Metadata = { title: 'Play a Trail', robots: { index: false } }

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!huntSwitchOn('enabled')) notFound()
  const trail = await loadPublishedTrail(slug)
  if (!trail) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${slug}/play`)

  const run = await startOrResumeRun(trail, profileId)
  const credits = run ? await loadRunCredits(run.runId, profileId) : []
  const view = projectForPlayer({
    graph: trail.graph,
    content: trail.content,
    credits,
    now: new Date(),
    huntState: trail.huntState,
    revision: trail.revision,
  })

  return (
    <FocusTemplate
      eyebrow="Trail"
      title={trail.title}
      description={`${view.progress.done} of ${view.progress.total} stops${view.progress.finished ? '. You finished.' : '.'}`}
      width="default"
    >
      <div className="space-y-4">
        <HuntPlayerSafety banner={view.banner} />
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
                {s.teaser ? <p className="text-body-sm text-muted">{s.teaser}</p> : null}
                {!s.clue && !s.teaser ? <p className="text-body-sm text-subtle">Locked for now.</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </FocusTemplate>
  )
}
