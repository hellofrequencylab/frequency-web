import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Globe, Lock, Link2, CheckCircle, Heart, GitFork, Clock, Pencil, Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getPlan, planPillarMap, isPlanAdopted, type JourneyPlanItem } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JourneyBuilder, type BuilderItem } from '@/components/studio/journey/journey-builder'
import { adoptPlanAction, forkPlanAction } from '../actions'

export const dynamic = 'force-dynamic'

function itemCadence(it: JourneyPlanItem): string | null {
  return it.cadence ?? it.practice?.cadence ?? null
}

export default async function JourneyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams
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
  if (!isAuthor && plan.visibility === 'private') notFound()

  // ── Author → the Studio builder (the live editing window). ────────────────
  if (isAuthor && !preview) {
    const builderItems: BuilderItem[] = items.map((it) => ({
      practiceId: it.practice_id,
      title: it.practice?.title ?? 'Practice',
      description: it.practice?.description ?? null,
      domainId: it.domain_id ?? it.practice?.domain_id ?? null,
      note: it.note,
      cadence: it.cadence,
      practiceCadence: it.practice?.cadence ?? null,
    }))
    const available = library
      .filter((p) => p.is_public)
      .map((p) => ({ id: p.id, title: p.title, description: p.description, domainId: p.domain_id }))

    return (
      <JourneyBuilder
        planId={plan.id}
        slug={plan.slug}
        initialTitle={plan.title}
        initialSummary={plan.summary}
        initialIntro={plan.intro}
        initialEmoji={plan.emoji}
        initialAccent={plan.accent}
        initialVisibility={plan.visibility}
        initialItems={builderItems}
        available={available}
        pillars={pillars.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
        isCrew={isCrew}
      />
    )
  }

  // ── Everyone else (and author preview) → the read-only journey. ───────────
  const adopted = !isAuthor && profileId ? await isPlanAdopted(profileId, plan.id) : false
  const byId = pillarsById(pillars)
  const coverage = new Map(planPillarMap(items).map((s) => [s.domainId, s.count]))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Journeys
      </Link>

      {isAuthor && preview && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm text-muted">Preview — how others see your journey.</span>
          <Link href={`/journeys/${plan.slug}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
            <Pencil className="h-3.5 w-3.5" /> Back to editing
          </Link>
        </div>
      )}

      {/* Identity header */}
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
          >
            {plan.emoji || '🧭'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{plan.title}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
                {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : plan.visibility === 'unlisted' ? <Link2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
              </span>
            </div>
            {plan.summary && <p className="mt-1 text-sm leading-relaxed text-muted">{plan.summary}</p>}
            {plan.adopt_count > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-subtle">
                <Users className="h-3 w-3" /> {plan.adopt_count} {plan.adopt_count === 1 ? 'person on this path' : 'people on this path'}
              </p>
            )}
          </div>
        </div>

        {/* Pillar coverage */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {pillars.map((pl) => {
            const n = coverage.get(pl.id) ?? 0
            return (
              <span key={pl.slug} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${n > 0 ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-subtle'}`}>
                {pl.name} {n > 0 ? n : ''}
              </span>
            )
          })}
        </div>
      </div>

      {/* Intro / story */}
      {plan.intro && (
        <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-border bg-surface p-5 text-sm leading-relaxed text-text">
          {plan.intro}
        </div>
      )}

      {/* The path */}
      <section className="mt-6">
        <h2 className="mb-2 px-1 text-sm font-bold text-text">The path · {items.length} {items.length === 1 ? 'step' : 'steps'}</h2>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center text-sm text-muted">This journey has no practices yet.</div>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => {
              const pid = it.domain_id ?? it.practice?.domain_id ?? null
              const pillar = pid ? byId.get(pid) : null
              const cadence = itemCadence(it)
              return (
                <li key={it.id} className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-bold tabular-nums text-subtle">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-text">{it.practice?.title ?? 'Practice'}</span>
                        {pillar ? <PillarBadge name={(pillar as Pillar).name} /> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        {cadence && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{cadence}</span>}
                        {it.note && <span className="line-clamp-1">· {it.note}</span>}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Non-author: adopt / remix */}
      {!isAuthor && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
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
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-bg px-4 py-2 text-sm font-semibold text-success"><CheckCircle className="h-4 w-4" /> Adopted</span>
              ) : (
                <form action={adoptPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="slug" value={plan.slug} />
                  <button type="submit" disabled={items.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
                    {isCrew ? <Heart className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Adopt
                  </button>
                </form>
              )}
              <form action={forkPlanAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary-strong">
                  {isCrew ? <GitFork className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Remix
                </button>
              </form>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
