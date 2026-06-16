import Link from 'next/link'
import { GraduationCap, ArrowRight, BookOpen } from 'lucide-react'
import { requireLeadFloor } from '@/lib/admin/guard'
import { getAllTrainingCategories, trainingHref } from '@/lib/leader-training/content'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

// Leader Training library home — the right-pane landing of the two-pane docs library (the left
// category index lives in the route layout). Reads like a help center home: a "Start here" entry,
// then every category with its docs listed as a clean, described table of contents. Behind the
// host+ /lead gate (inherited + re-asserted, fail-closed). Docs render with the shared
// <HelpMarkdown> via the [category]/[slug] route.
export const metadata = {
  title: 'Leader Training',
  description: 'Guides for people who run Circles and author Journeys.',
}

export default async function LeaderTrainingPage() {
  await requireLeadFloor()
  const categories = await getAllTrainingCategories()
  const start = categories[0]?.docs[0] ?? null

  return (
    <IndexTemplate
      eyebrow="Leadership"
      title="Leader Training"
      description="Guides for people who run Circles and author Journeys. Read these before you build."
      back={{ href: '/lead', label: 'Leadership' }}
    >
      {categories.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Training guides are coming soon"
          description="We are writing up the playbooks for running a Circle and authoring a Journey. Check back soon."
        />
      ) : (
        <div className="space-y-10">
          {/* Start here — point a new leader at the foundational guide. */}
          {start && (
            <Link
              href={trainingHref(start.category, start.slug)}
              className="group flex items-start gap-4 rounded-2xl border border-primary/30 bg-primary-bg/40 p-5 transition-colors hover:border-primary/50"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-strong">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-primary-strong">Start here</span>
                <span className="mt-0.5 block font-semibold text-text">{start.title}</span>
                {start.description && <span className="mt-0.5 block text-sm text-muted">{start.description}</span>}
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary-strong transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          {/* Every category as a described table of contents. */}
          {categories.map((cat) => (
            <section key={cat.slug}>
              <div className="mb-3 border-b border-border pb-2">
                <h2 className="text-base font-bold text-text">{cat.title}</h2>
                {cat.description && <p className="mt-0.5 text-sm text-muted">{cat.description}</p>}
              </div>
              <ul className="divide-y divide-border/60">
                {cat.docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={trainingHref(cat.slug, d.slug)}
                      className="group flex items-start gap-3 py-3 transition-colors hover:bg-surface-elevated/50"
                    >
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-text group-hover:text-primary-strong">{d.title}</span>
                        {d.description && <span className="mt-0.5 block text-sm text-muted">{d.description}</span>}
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
