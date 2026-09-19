import Link from 'next/link'
import { cn } from '@/lib/utils'

// ADMIN / GUEST (ADR-1389). The switch a Space's team uses on its public Calendar tab to flip between the
// full team calendar and exactly what a visitor sees. Links, not client state: the mode lives in the URL
// (`?view=guest`), so the server only ever loads the private layer for Admin, and a Guest view can be
// shared or reloaded as it is.

export type CalendarMode = 'admin' | 'guest'

export function CalendarModeToggle({ slug, mode }: { slug: string; mode: CalendarMode }) {
  const base = `/spaces/${slug}/calendar`
  const options: { mode: CalendarMode; label: string; href: string }[] = [
    { mode: 'admin', label: 'Admin', href: base },
    { mode: 'guest', label: 'Guest', href: `${base}?view=guest` },
  ]
  return (
    <nav aria-label="Admin or Guest calendar" className="inline-flex items-center rounded-control border border-border p-0.5">
      {options.map((o) => (
        <Link
          key={o.mode}
          href={o.href}
          scroll={false}
          replace
          aria-current={mode === o.mode ? 'page' : undefined}
          className={cn(
            'rounded-control px-3 py-1 text-body-sm font-semibold transition-colors',
            mode === o.mode ? 'bg-primary text-on-primary' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  )
}
