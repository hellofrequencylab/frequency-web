import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { requireLeadFloor } from '@/lib/admin/guard'
import { getAllTrainingCategories, trainingHref } from '@/lib/leader-training/content'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

// Leader Training library index — the leader-gated sibling of the public help center.
// Same browse grammar (IndexTemplate + category cards), behind the host+ /lead gate
// (inherited from app/(main)/lead/layout.tsx; re-asserted here, fail-closed). Docs come
// from content/leader-training and render with the SAME <HelpMarkdown> renderer the
// help center uses (see the [category]/[slug] route).
export const metadata = {
  title: 'Leader Training',
  description: 'Guides for people who run Circles and author Journeys.',
}

export default async function LeaderTrainingPage() {
  await requireLeadFloor()
  const categories = await getAllTrainingCategories()

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
        <div className="grid gap-5 sm:grid-cols-2">
          {categories.map((cat) => (
            <section
              key={cat.slug}
              className="rounded-xl border border-border bg-surface-elevated p-5"
            >
              {cat.description && <p className="mb-4 text-sm text-muted">{cat.description}</p>}
              <ul className="space-y-1.5">
                {cat.docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={trainingHref(cat.slug, d.slug)}
                      className="text-sm text-primary-strong hover:underline"
                    >
                      {d.title}
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
