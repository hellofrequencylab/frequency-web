import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, Plus, X, Globe, Lock, CheckCircle, Heart, GitFork,
  ChevronUp, ChevronDown, Clock, Pencil, Sparkles,
} from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getPlan, planPillarMap, isPlanAdopted, type JourneyPlanItem } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { DetailTemplate } from '@/components/templates/detail-template'
import {
  addItemAction, removeItemAction, updateItemAction, moveItemAction,
  updatePlanAction, setVisibilityAction, publishPlanAction, adoptPlanAction, forkPlanAction,
} from '../actions'

export const dynamic = 'force-dynamic'

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']

// Effective cadence for an item: the per-journey override, else the practice's own.
function itemCadence(it: JourneyPlanItem): string | null {
  return it.cadence ?? it.practice?.cadence ?? null
}

export default async function JourneyPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [caller, loaded, library, pillars] = await Promise.all([
    getCallerProfile(),
    getPlan(slug),
    listPublicPractices(),
    getPillars(),
  ])
  if (!loaded) notFound()
  const { plan, items } = loaded
  const profileId = caller?.id ?? null
  const isCrew = !!caller && atLeastRole(caller.community_role, 'crew')

  const isAuthor = !!profileId && plan.author_id === profileId
  // Private plans are visible to their author only (the admin read bypasses RLS).
  if (!isAuthor && plan.visibility === 'private') notFound()

  const adopted = !isAuthor && profileId ? await isPlanAdopted(profileId, plan.id) : false

  const byId = pillarsById(pillars)
  const coverage = new Map(planPillarMap(items).map((s) => [s.domainId, s.count]))

  // Practice picker (author only): public practices not already in the plan,
  // grouped by Pillar so the path stays balanced.
  const inPlan = new Set(items.map((i) => i.practice_id))
  const available = library.filter((p) => p.is_public && !inPlan.has(p.id))
  const groups = pillars
    .map((pl) => ({ pillar: pl as Pillar | null, list: available.filter((p) => p.domain_id === pl.id) }))
    .filter((g) => g.list.length > 0)
  const uncategorized = available.filter((p) => !p.domain_id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Journeys
      </Link>

      {/* Identity header (DetailTemplate): title + visibility badge, summary
          subtitle, pillar coverage as the first body row. The author edit form
          below is left exactly as-is. */}
      <DetailTemplate
        title={plan.title}
        badges={
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
            {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
          </span>
        }
        subtitle={plan.summary ?? undefined}
      >
        {/* Pillar coverage */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          {pillars.map((pl) => {
            const n = coverage.get(pl.id) ?? 0
            return (
              <span
                key={pl.slug}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  n > 0 ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-subtle'
                }`}
              >
                {pl.name} {n}
              </span>
            )
          })}
        </div>

        {/* Author: edit plan details (native disclosure, no client JS). */}
        {isAuthor && (
          <details className="mb-6 rounded-2xl border border-border bg-surface">
            <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted">
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </summary>
            <form action={updatePlanAction} className="space-y-2 border-t border-border px-4 py-3">
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="slug" value={plan.slug} />
              <input name="title" defaultValue={plan.title} maxLength={120} placeholder="Title" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input name="summary" defaultValue={plan.summary ?? ''} maxLength={280} placeholder="One line about it" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input name="coverImage" defaultValue={plan.cover_image ?? ''} maxLength={500} placeholder="Cover image URL (optional)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text" />
              <button type="submit" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
                Save details
              </button>
            </form>
          </details>
        )}

      {/* The path (current items) */}
      <section className="mb-8">
        <h2 className="mb-2 px-1 text-sm font-bold text-text">The path · {items.length} {items.length === 1 ? 'practice' : 'practices'}</h2>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            {isAuthor ? 'Add practices below to build the path.' : 'This journey has no practices yet.'}
          </div>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => {
              const pid = it.domain_id ?? it.practice?.domain_id ?? null
              const pillar = pid ? byId.get(pid) : null
              const cadence = itemCadence(it)
              return (
                <li key={it.id} className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-bold text-subtle tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text">{it.practice?.title ?? 'Practice'}</span>
                          {pillar ? <PillarBadge name={pillar.name} /> : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                          {cadence && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />{cadence}
                              {it.cadence && <span className="text-subtle">(this journey)</span>}
                            </span>
                          )}
                          {it.note && <span className="line-clamp-1">· {it.note}</span>}
                        </div>
                      </div>
                    </div>
                    {isAuthor && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <form action={moveItemAction}>
                          <input type="hidden" name="planId" value={plan.id} />
                          <input type="hidden" name="slug" value={plan.slug} />
                          <input type="hidden" name="practiceId" value={it.practice_id} />
                          <input type="hidden" name="dir" value="up" />
                          <button type="submit" disabled={i === 0} aria-label="Move up" className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-30">
                            <ChevronUp className="h-4 w-4" />
                          </button>
                        </form>
                        <form action={moveItemAction}>
                          <input type="hidden" name="planId" value={plan.id} />
                          <input type="hidden" name="slug" value={plan.slug} />
                          <input type="hidden" name="practiceId" value={it.practice_id} />
                          <input type="hidden" name="dir" value="down" />
                          <button type="submit" disabled={i === items.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-30">
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </form>
                        <form action={removeItemAction}>
                          <input type="hidden" name="planId" value={plan.id} />
                          <input type="hidden" name="slug" value={plan.slug} />
                          <input type="hidden" name="practiceId" value={it.practice_id} />
                          <button type="submit" aria-label="Remove from journey" className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-danger">
                            <X className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Author: per-item cadence + note (the "variable controls"). */}
                  {isAuthor && (
                    <details className="mt-2 border-t border-border pt-2">
                      <summary className="cursor-pointer text-xs font-medium text-primary-strong">Cadence &amp; note</summary>
                      <form action={updateItemAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="planId" value={plan.id} />
                        <input type="hidden" name="slug" value={plan.slug} />
                        <input type="hidden" name="practiceId" value={it.practice_id} />
                        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                          Cadence
                          <select name="cadence" defaultValue={it.cadence ?? ''} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text">
                            <option value="">Use practice default{it.practice?.cadence ? ` (${it.practice.cadence})` : ''}</option>
                            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </label>
                        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                          Note
                          <input name="note" defaultValue={it.note ?? ''} maxLength={200} placeholder="e.g. before breakfast" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text" />
                        </label>
                        <button type="submit" className="rounded-lg bg-surface-elevated px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-primary-bg hover:text-primary-strong">
                          Save
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Non-author: adopt the journey or remix it into your own. */}
      {!isAuthor && (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {adopted
                ? 'You’ve adopted this journey — its practices are in your daily loop.'
                : isCrew
                  ? 'Adopt it to add these practices to your daily loop, or remix it into your own.'
                  : 'Adopting and remixing library journeys is a Crew perk.'}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {adopted ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-bg px-4 py-2 text-sm font-semibold text-success">
                  <CheckCircle className="h-4 w-4" /> Adopted
                </span>
              ) : (
                <form action={adoptPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="slug" value={plan.slug} />
                  <button
                    type="submit"
                    disabled={items.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCrew ? <Heart className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Adopt
                  </button>
                </form>
              )}
              <form action={forkPlanAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary-strong"
                >
                  {isCrew ? <GitFork className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Remix
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

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
                        <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-text">{p.title}</span>
                            {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.description}</p>}
                          </div>
                          <form action={addItemAction}>
                            <input type="hidden" name="planId" value={plan.id} />
                            <input type="hidden" name="slug" value={plan.slug} />
                            <input type="hidden" name="practiceId" value={p.id} />
                            <input type="hidden" name="domainId" value={p.domain_id ?? ''} />
                            <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-primary-bg hover:text-primary-strong">
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

          {/* Share / publish — the library is the Crew (paid) surface. */}
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            {plan.visibility === 'public' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle className="h-4 w-4" /> Live in the community library.
                </p>
                <form action={setVisibilityAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="slug" value={plan.slug} />
                  <input type="hidden" name="visibility" value="unlisted" />
                  <button type="submit" className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated">
                    Unpublish (make unlisted)
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {items.length === 0
                    ? 'Add at least one practice, then share it with the community.'
                    : isCrew
                      ? 'Happy with the path? Share it to the open library.'
                      : 'Publishing to the library is a Crew perk — your personal journey works free.'}
                </p>
                <form action={publishPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="slug" value={plan.slug} />
                  <button
                    type="submit"
                    disabled={items.length === 0}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCrew ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Publish to library
                  </button>
                </form>
              </div>
            )}
            {plan.visibility === 'private' && (
              <form action={setVisibilityAction} className="border-t border-border pt-3">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="slug" value={plan.slug} />
                <input type="hidden" name="visibility" value="unlisted" />
                <button type="submit" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text">
                  <Sparkles className="h-3.5 w-3.5" /> Make unlisted (shareable by link, not in the library)
                </button>
              </form>
            )}
          </section>
        </>
      )}
      </DetailTemplate>
    </div>
  )
}
