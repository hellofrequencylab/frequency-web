import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { getAllCategories, helpHref } from '@/lib/help/content'
import { EmptyState } from '@/components/ui/empty-state'
import { IndexTemplate } from '@/components/templates'

export const metadata: Metadata = {
  title: 'Help Center',
  description:
    'Guides and answers for using Frequency: finding Circles, going to gatherings, and how the Quest works.',
  alternates: { canonical: '/help' },
}

export default async function HelpHomePage() {
  const categories = await getAllCategories()

  return (
    <IndexTemplate
      title="How can we help?"
      description="Everything you need to find your people, show up, and make the most of Frequency."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {categories.map((cat) => (
          <section
            key={cat.slug}
            className="rounded-xl border border-border bg-surface-elevated p-5"
          >
            <Link href={`/help/${cat.slug}`} className="block">
              <h2 className="font-display text-xl text-text">{cat.title}</h2>
              {cat.description && (
                <p className="mt-1 text-sm text-muted">{cat.description}</p>
              )}
            </Link>
            <ul className="mt-4 space-y-1.5">
              {cat.articles.slice(0, 5).map((a) => (
                <li key={a.slug}>
                  <Link
                    href={helpHref(cat.slug, a.slug)}
                    className="text-sm text-primary-strong hover:underline"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {categories.length === 0 && (
        <EmptyState
          icon={LifeBuoy}
          title="Help articles are coming soon"
          description="We're writing up guides for finding Circles, showing up, and how the Quest works. Check back soon."
        />
      )}
    </IndexTemplate>
  )
}
