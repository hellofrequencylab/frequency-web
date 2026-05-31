import type { Metadata } from 'next'
import { getMyProfileId } from '@/lib/auth'
import { listPublicPractices, getMemberPractices } from '@/lib/practices'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'

export const metadata: Metadata = {
  title: 'Practices',
  description: 'Choose what you practice and log it to build your streak.',
}

export default async function PracticesPage() {
  const profileId = await getMyProfileId()
  const [library, mine] = await Promise.all([
    listPublicPractices(),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
  ])
  const mineIds = new Set(mine.map((p) => p.id))
  const unadopted = library.filter((p) => !mineIds.has(p.id))

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-text mb-1">Practices</h1>
      <p className="text-muted mb-8">
        A practice is what you do. Adopt one for yourself or do your circle&rsquo;s, then log
        it each day to earn zaps and build your streak.
      </p>

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
  )
}
