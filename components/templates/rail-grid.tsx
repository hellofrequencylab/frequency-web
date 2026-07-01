// Rail/Grid pattern (PAGE-FRAMEWORK) — the shared mobile-first browse layout: a narrow
// filter/folder MENU pinned on the left with a fluid content GRID on the right, at EVERY width.
// The menu is "mini" on phones (a slim rail) and widens on larger screens; the content never wraps
// underneath it. Use for any browse surface that pairs a filter rail with a card grid (Loom Studio,
// and other rail+grid pages). Presentational + server-friendly (no hooks); the `menu` slot brings
// its own <nav>/semantics, this only owns the responsive geometry + sticky.
import type { ReactNode } from 'react'

export function RailGrid({
  menu,
  children,
  className = '',
}: {
  /** The left menu/rail content (supplies its own nav landmark). */
  menu: ReactNode
  /** The right content (grid, list, pagination…). */
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start gap-3 sm:gap-5 lg:gap-6 ${className}`}>
      <div className="w-28 shrink-0 sm:w-44 lg:w-52">
        <div className="sticky top-4">{menu}</div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
