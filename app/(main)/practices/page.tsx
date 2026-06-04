import type { Metadata } from 'next'
import Link from 'next/link'
import { Flame, Sparkles, Library } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import {
  listPublicPractices,
  getMemberPractices,
  getRecentPracticeLogs,
} from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { CreatePracticeForm } from '@/components/practice/create-practice-form'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { IndexTemplate } from '@/components/templates/index-template'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'Practices',
  description: 'Choose what you practice and log it to build your streak.',
}

function PillarFilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-bg text-primary-strong'
          : 'bg-surface-elevated text-muted hover:text-text'
      }`}
    >
      {label}
    </Link>
  )
}

export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ pillar?: string }>
}) {
  const profileId = await getMyProfileId()
  const [library, mine, recent, pillars] = await Promise.all([
    listPublicPractices(),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
    getPillars(),
  ])
  const byId = pillarsById(pillars)
  const mineIds = new Set(mine.map((p) => p.id))

  // Library filter by Pillar (URL-driven, so it's shareable + needs no client JS).
  const { pillar: pillarParam } = await searchParams
  const activePillar = pillars.find((p) => p.slug === pillarParam)?.id ?? null
  const unadopted = library
    .filter((p) => !mineIds.has(p.id))
    .filter((p) => !activePillar || p.domain_id === activePillar)

  // Last 14 days as a simple activity strip (filled = logged a practice that day).
  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const daysLogged = last14.filter((d) => loggedDays.has(d)).length

  return (
    <IndexTemplate
      title="Practices"
      description="This is where the points come from. A practice is the thing you actually do — adopt one, then log it every day to earn zaps, climb the ranks, and keep your streak alive."
    >
      <StatStrip
        items={[
          { value: mine.length, label: 'Your practices' },
          { value: daysLogged, label: 'Days logged (14d)' },
          { value: library.length, label: 'In the library' },
        ]}
      />

      <div className="max-w-2xl space-y-8">
        {profileId && (recent.length > 0 || mine.length > 0) && (
          <section>
            <SectionHeader title="Your activity" />
            {/* Grouped on the canvas (no box) — a widget, not a distinct object. */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <Flame className="h-4 w-4 text-primary" />Last 14 days
                </span>
                <span className="text-sm font-semibold text-text">
                  {daysLogged} {daysLogged === 1 ? 'day' : 'days'} practiced
                </span>
              </div>
              <div className="flex gap-1.5">
                {last14.map((d) => (
                  <div
                    key={d}
                    title={d}
                    className={`h-7 flex-1 rounded-lg ${
                      loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'
                    }`}
                  />
                ))}
              </div>
              {recent.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                  {recent.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-text">{r.title ?? 'A practice'}</span>
                      <span className="tabular-nums text-subtle">{r.logged_for}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="Your practices" count={mine.length} />
          {mine.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing adopted yet"
              description="Pick a practice from the library below to start earning zaps and building a streak."
            />
          ) : (
            <ul className="space-y-3">
              {mine.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-text">{p.title}</p>
                      {p.domain_id && byId.has(p.domain_id) && <PillarBadge name={byId.get(p.domain_id)!.name} />}
                    </div>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <LogPracticeButton practiceId={p.id} />
                    <AdoptPracticeButton practiceId={p.id} adopted />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Practice library" count={library.length} />

          {/* Filter the library by Pillar (Mind / Body / Spirit / Expression). */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <PillarFilterChip label="All" href="/practices" active={!activePillar} />
            {pillars.map((pl) => (
              <PillarFilterChip
                key={pl.slug}
                label={pl.name}
                href={`/practices?pillar=${pl.slug}`}
                active={pillarParam === pl.slug}
              />
            ))}
          </div>

          {profileId && (
            <div className="mb-3">
              <CreatePracticeForm />
            </div>
          )}
          {unadopted.length === 0 ? (
            <EmptyState
              icon={Library}
              title="You've adopted everything"
              description="Every practice in the library is on your list. Nicely done."
            />
          ) : (
            <ul className="space-y-3">
              {unadopted.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-text">{p.title}</p>
                      {p.domain_id && byId.has(p.domain_id) && <PillarBadge name={byId.get(p.domain_id)!.name} />}
                    </div>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.description}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <AdoptPracticeButton practiceId={p.id} adopted={false} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}
