import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Check, Lock, MapPin } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { HuntPlayerSafety } from '@/components/hunts/moderation-screens'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { projectForPlayer } from '@/lib/hunts/player'
import { loadPlayerRun, loadPublishedTrail, loadRunCredits, startOrResumeRun } from '@/lib/hunts/run-store'

export const dynamic = 'force-dynamic'

// THE PLAYER PAGE (FH-016): one signed-in member's run on one published Trail. Reading never credits:
// credit goes through the claim path only. The server decides which words leave it (projectForPlayer):
// a locked stop shows its position, an open stop shows its clue without the place, and a visited
// stop shows both. The current stop's optional hint requires an explicit request.

export const metadata: Metadata = { title: 'Play a Trail', robots: { index: false } }

export default async function PlayPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ hint?: string | string[] }>
}) {
  const { slug } = await params
  if (!huntSwitchOn('enabled')) notFound()
  const trail = await loadPublishedTrail(slug)
  if (!trail) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/${slug}/play`)

  const { hint } = await searchParams
  const run = hint === undefined ? await startOrResumeRun(trail, profileId) : await loadPlayerRun(trail, profileId)
  const credits = run ? await loadRunCredits(run.runId, profileId) : []
  const view = projectForPlayer({
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
      </div>
    </FocusTemplate>
  )
}
