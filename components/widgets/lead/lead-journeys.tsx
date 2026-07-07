import Link from 'next/link'
import { BookOpen, Layers, Users, Activity } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'
import { getMyPlanSummaries } from '@/lib/journey-plans'
import { getCohortProgress } from '@/lib/journeys/runs'
import { LeadCreatePrompt } from './lead-create-prompt'

// Leadership dashboard layout module (ADR-270): "Your Journeys & runs" — the Journeys this leader
// authored (journey_plans.author_id = me) and the active Runs going on inside the circles they lead
// (journey_runs scoped to getLedCircles(me.id), status = 'active'). Self-fetching RSC scoped strictly
// to the caller: authored plans key on author_id; runs key on the led circle ids. Self-hides when
// the leader has neither an authored Journey nor an active Run.

type ActiveRun = {
  id: string
  planId: string
  planTitle: string
  planSlug: string
  circleName: string
  /** Shared cohort meter (0-100), or null when it could not be computed. */
  meanPercent: number | null
  memberCount: number
}

export async function LeadJourneys(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const [authored, circles] = await Promise.all([
    getMyPlanSummaries(me.id),
    getLedCircles(me.id),
  ])

  // Active Runs inside the circles this leader stewards — scoped to the led circle ids only,
  // never platform-wide. Joins the plan (title + slug) so each run links to its Journey, and rolls
  // up the shared cohort meter (mean completion) for a modest, verified progress read.
  const activeRuns: ActiveRun[] = []
  const circleIds = circles.map((c) => c.id)
  if (circleIds.length > 0) {
    const circleNameById = new Map(circles.map((c) => [c.id, c.name]))
    const { data: runRows } = await createAdminClient()
      .from('journey_runs')
      .select('id, plan_id, circle_id, status, plan:journey_plans!plan_id ( title, slug )')
      .in('circle_id', circleIds)
      .eq('status', 'active')
      .order('started_at', { ascending: false })

    type RunRow = {
      id: string
      plan_id: string
      circle_id: string
      plan: { title: string | null; slug: string | null } | null
    }
    const rows = ((runRows ?? []) as unknown as RunRow[]).filter((r) => r.plan?.slug)

    const progressList = await Promise.all(
      rows.map((r) => getCohortProgress(r.id, r.plan_id).catch(() => null)),
    )
    rows.forEach((r, i) => {
      const progress = progressList[i]
      activeRuns.push({
        id: r.id,
        planId: r.plan_id,
        planTitle: r.plan?.title ?? 'Untitled journey',
        planSlug: r.plan!.slug!,
        circleName: circleNameById.get(r.circle_id) ?? 'a circle',
        meanPercent: progress ? progress.meanPercent : null,
        memberCount: progress ? progress.memberCount : 0,
      })
    })
  }

  // Always render (owner directive): a leader who has authored no Journey and has no active run sees a
  // prompt to build their first one, instead of the section vanishing.
  if (authored.length === 0 && activeRuns.length === 0) {
    return (
      <LeadCreatePrompt
        section="Your Journeys"
        icon={BookOpen}
        title="You have not authored a Journey yet"
        description="A Journey is a guided arc of Practices your circle moves through together over days or weeks. Build one and run it with the people you lead."
        ctaHref="/journeys/new"
        ctaLabel="Create a Journey"
      />
    )
  }

  return (
    <section className="space-y-6">
      {authored.length > 0 && (
        <div>
          <SectionHeader title="Journeys you authored" count={authored.length} href="/journeys/mine" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {authored.map((p) => (
              <EntityCard
                key={p.id}
                href={`/journeys/${p.slug}`}
                title={
                  <span className="inline-flex items-center gap-1.5">
                    {p.emoji && <span aria-hidden>{p.emoji}</span>}
                    <span className="truncate">{p.title}</span>
                  </span>
                }
                context={p.summary ?? undefined}
                meta={
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" aria-hidden />
                      {p.phaseCount} {p.phaseCount === 1 ? 'phase' : 'phases'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />
                      {p.stepCount} {p.stepCount === 1 ? 'step' : 'steps'}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </div>
      )}

      {activeRuns.length > 0 && (
        <div>
          <SectionHeader title="Active runs in your circles" count={activeRuns.length} />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {activeRuns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/journeys/${r.planSlug}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{r.planTitle}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
                      <span className="truncate">{r.circleName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {r.memberCount} {r.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      {r.meanPercent != null && (
                        <span className="inline-flex items-center gap-1">
                          <Activity className="h-3.5 w-3.5" aria-hidden />
                          {r.meanPercent}% complete
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
