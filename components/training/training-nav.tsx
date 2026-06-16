'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface TrainingNavCategory {
  slug: string
  title: string
  docs: { slug: string; title: string; href: string }[]
}

// Sidebar index for the Leader Training docs library — the leader-gated twin of the help
// center's <HelpNav>. Client component so it can highlight the active doc via usePathname;
// the category tree itself is built on the server in the layout. Training has no per-category
// landing route, so the category title is a plain heading (only the docs are links).
export function TrainingNav({ categories }: { categories: TrainingNavCategory[] }) {
  const pathname = usePathname()
  return (
    <nav className="space-y-6" aria-label="Training topics">
      {categories.map((cat) => (
        <div key={cat.slug}>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{cat.title}</p>
          <ul className="mt-2 space-y-1">
            {cat.docs.map((d) => {
              const active = pathname === d.href
              return (
                <li key={d.href}>
                  <Link
                    href={d.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'block rounded-md px-2 py-1 text-sm transition-colors ' +
                      (active
                        ? 'bg-primary-bg font-medium text-primary-strong'
                        : 'text-muted hover:bg-surface-elevated hover:text-text')
                    }
                  >
                    {d.title}
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
