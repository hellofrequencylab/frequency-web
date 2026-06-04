import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus, X, Map as MapIcon, Globe, Lock, CheckCircle } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getPlan, planPillarMap } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { addItemAction, removeItemAction, publishPlanAction } from '../actions'

export default async function JourneyPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [profileId, loaded, library, pillars] = await Promise.all([
    getMyProfileId(),
    getPlan(slug),
    listPublicPractices(),
    getPillars(),
  ])
  if (!loaded) notFound()
  const { plan, items } = loaded

  const isAuthor = !!profileId && plan.author_id === profileId
  // Private plans are visible to their author only (the admin read bypasses RLS).
  if (!isAuthor && plan.visibility === 'private') notFound()

  const byId = pillarsById(pillars)
  const coverage = new Map(planPillarMap(items).map((s) => [s.domainId, s.count]))

  // Practice picker (author only): public practices not already in the plan,
  // grouped by Pillar so the path stays balanced.
  const inPlan = new Set(items.map((i) => i.practice_id))
  const available = library.filter((p) => p.is_public && !inPlan.has(p.id))
  const groups = pillars
    .map((pl) => ({ pillar: pl, list: available.filter((p) => p.domain_id === pl.id) }))
    .filter((g) => g.list.length > 0)
  const uncategorized = available.filter((p) => !p.domain_id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Journeys
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-signal-bg text-signal-strong">
            <MapIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{plan.title}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted">
                {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
              </span>
            </div>
            {plan.summary && <p className="mt-1 text-sm text-muted">{plan.summary}</p>}
            {/* Pillar coverage */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pillars.map((pl) => {
                const n = coverage.get(pl.id) ?? 0
                return (
                  <span
                    key={pl.slug}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      n > 0 ? 'bg-signal-bg text-signal-strong' : 'bg-surface-elevated text-subtle'
                    }`}
                  >
                    {pl.name} {n}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* The path (current items) */}
      <section className="mb-8">
        <h2 className="mb-2 px-1 text-sm font-bold text-text">The path · {items.length} {items.length === 1 ? 'practice' : 'practices'}</h2>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            {isAuthor ? 'Add practices below to build the path.' : 'This journey has no practices yet.'}
          </div>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-bold text-subtle tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text">{it.practice?.title ?? 'Practice'}</span>
                      {(() => {
                        const pid = it.domain_id ?? it.practice?.domain_id ?? null
                        const pillar = pid ? byId.get(pid) : null
                        return pillar ? <PillarBadge name={pillar.name} /> : null
                      })()}
                    </div>
                    {it.note && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{it.note}</p>}
                  </div>
                </div>
                {isAuthor && (
                  <form action={removeItemAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="slug" value={plan.slug} />
                    <input type="hidden" name="practiceId" value={it.practice_id} />
                    <button
                      type="submit"
                      aria-label="Remove from journey"
                      className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Author tools: picker + publish */}
      {isAuthor && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 px-1 text-sm font-bold text-text">Add practices</h2>
            {available.length === 0 ? (
              <p className="px-1 text-sm text-muted">Every practice in the library is on this path.</p>
            ) : (
              <div className="space-y-4">
                {[...groups, ...(uncategorized.length ? [{ pillar: null, list: uncategorized }] : [])].map((g, gi) => (
                  <div key={g.pillar?.slug ?? `other-${gi}`}>
                    <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                      {g.pillar?.name ?? 'Other'}
                    </p>
                    <ul className="space-y-2">
                      {g.list.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-text">{p.title}</span>
                            {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.description}</p>}
                          </div>
                          <form action={addItemAction}>
                            <input type="hidden" name="planId" value={plan.id} />
                            <input type="hidden" name="slug" value={plan.slug} />
                            <input type="hidden" name="practiceId" value={p.id} />
                            <input type="hidden" name="domainId" value={p.domain_id ?? ''} />
                            <button
                              type="submit"
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-signal-bg hover:text-signal-strong"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            {plan.visibility === 'public' ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" /> Live in the community library.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {items.length === 0
                    ? 'Add at least one practice, then share it with the community.'
                    : 'Happy with the path? Share it to the open library.'}
                </p>
                <form action={publishPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="slug" value={plan.slug} />
                  <button
                    type="submit"
                    disabled={items.length === 0}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-on-signal transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Globe className="h-4 w-4" /> Publish
                  </button>
                </form>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
