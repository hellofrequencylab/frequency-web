import type { Metadata } from 'next'
import { getMyProfileId } from '@/lib/auth'
import {
  listPublicPractices,
  getMemberPractices,
  getRecentPracticeLogs,
} from '@/lib/practices'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { CreatePracticeForm } from '@/components/practice/create-practice-form'
import { IndexTemplate } from '@/components/templates/index-template'

export const metadata: Metadata = {
  title: 'Practices',
  description: 'Choose what you practice and log it to build your streak.',
}

export default async function PracticesPage() {
  const profileId = await getMyProfileId()
  const [library, mine, recent] = await Promise.all([
    listPublicPractices(),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
  ])
  const mineIds = new Set(mine.map((p) => p.id))
  const unadopted = library.filter((p) => !mineIds.has(p.id))

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
      description="A practice is what you do. Adopt one for yourself or do your circle's, then log it each day to earn zaps and build your streak."
    >
      <div className="max-w-2xl">
      {profileId && (recent.length > 0 || mine.length > 0) && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-3">
            Your activity
          </h2>
          <div className="rounded-xl border border-border bg-surface-elevated px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm text-muted">Last 14 days</span>
              <span className="text-sm font-medium text-text">
                {daysLogged} {daysLogged === 1 ? 'day' : 'days'} practiced
              </span>
            </div>
            <div className="flex gap-1.5">
              {last14.map((d) => (
                <div
                  key={d}
                  title={d}
                  className={`h-6 flex-1 rounded ${
                    loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'
                  }`}
                />
              ))}
            </div>
            {recent.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {recent.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-text">{r.title ?? 'A practice'}</span>
                    <span className="text-subtle">{r.logged_for}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-3">
          Your practices
        </h2>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-elevated px-4 py-6 text-sm text-muted">
            You haven&rsquo;t adopted any practices yet. Pick one from the library below.
          </p>
        ) : (
          <ul className="space-y-3">
            {mine.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{p.title}</p>
                  {p.description && (
                    <p className="mt-0.5 text-sm text-muted line-clamp-2">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <LogPracticeButton practiceId={p.id} />
                  <AdoptPracticeButton practiceId={p.id} adopted />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-3">
          Practice library
        </h2>
        {profileId && (
          <div className="mb-3">
            <CreatePracticeForm />
          </div>
        )}
        {unadopted.length === 0 ? (
          <p className="text-sm text-muted">You&rsquo;ve adopted everything in the library.</p>
        ) : (
          <ul className="space-y-3">
            {unadopted.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{p.title}</p>
                  {p.description && (
                    <p className="mt-0.5 text-sm text-muted line-clamp-2">{p.description}</p>
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
