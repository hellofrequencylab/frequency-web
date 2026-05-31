'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface HelpNavCategory {
  slug: string
  title: string
  articles: { slug: string; title: string; href: string }[]
}

// Sidebar navigation for the help center. Client component only so it can
// highlight the active article via usePathname; the tree itself is server-built.
export function HelpNav({ categories }: { categories: HelpNavCategory[] }) {
  const pathname = usePathname()
  return (
    <nav className="space-y-6" aria-label="Help topics">
      {categories.map((cat) => (
        <div key={cat.slug}>
          <Link
            href={`/help/${cat.slug}`}
            className="block text-xs font-semibold uppercase tracking-wide text-subtle hover:text-text"
          >
            {cat.title}
          </Link>
          <ul className="mt-2 space-y-1">
            {cat.articles.map((a) => {
              const active = pathname === a.href
              return (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className={
                      'block rounded-md px-2 py-1 text-sm ' +
                      (active
                        ? 'bg-primary-bg text-primary-strong font-medium'
                        : 'text-muted hover:bg-surface hover:text-text')
                    }
                  >
                    {a.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
