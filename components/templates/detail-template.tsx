// Detail template — the "nested page" shell (PAGE-FRAMEWORK §3, Template C).
//
// One consistent grammar for every single-entity page (a Circle, an Interest, an
// Event, a Profile): a context header band (identity · badges · inline actions)
// over a tab row over the body. The body is itself usually a Stream or Index —
// templates nest, you reuse not rebuild.
//
// NOTE on the right rail: a Detail page's scope-scoped rail is rendered by the
// global shell via the route layout's `sidebar` slot (AppShell) — NOT here.
// Rendering a second rail inside the page is the double-sidebar trap we avoid.
//
// Presentational + server-friendly (no hooks). `tabs[].active` is precomputed by
// the page, so this works in a server component.

import Link from 'next/link'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

export interface DetailTab {
  href: string
  label: string
  active?: boolean
}

export function DetailTemplate({
  title,
  subtitle,
  badges,
  actions,
  tabs,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Status / mode chips (e.g. the in-person designator). */
  badges?: React.ReactNode
  /** Capability-gated inline actions (the headerActions slot). Gate with <Can>. */
  actions?: React.ReactNode
  tabs?: DetailTab[]
  children: React.ReactNode
}) {
  return (
    <div>
      {/* Context header band. On mobile the actions stack BELOW the identity so the
          title is never crushed into a truncation; from sm up they sit inline right. */}
      <header className="border-b border-border pb-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-text break-words">{title}</h1>
              {badges}
            </div>
            {subtitle && (
              <div className="mt-1 text-sm text-muted">{subtitle}</div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap sm:shrink-0">{actions}</div>}
        </div>

        {/* Context tabs */}
        {tabs && tabs.length > 0 && (
          <nav className="flex items-center gap-1 mt-4 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab.active
                    ? 'bg-primary-bg text-primary-strong'
                    : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* The on-page "Settings" split sits on the line under the header. */}
      <PageAdminBar />

      {/* Body — usually a Stream or Index */}
      {children}
    </div>
  )
}
