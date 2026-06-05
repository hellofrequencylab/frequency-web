// Dashboard template — the operator / steward KPI shell (PAGE-FRAMEWORK §3,
// "Dashboard"). For metric-led workspaces: Marketing, CRM, the Crew home. A
// shared header (eyebrow / title / description / actions) + an optional StatCard
// row + content sections.
//
// This is the no-rail OPERATOR sibling of <AdminPage>: same header grammar and
// rhythm, lives inside a Focus route (page-chrome → 'none'). Compose the stat row
// from the shared <StatCard> (deltas + drill-downs) — never hand-roll stat tiles
// (REDESIGN-INAPP defect #6/#8). Group body content in <AdminSection>-style
// sections or plain <section>s.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

const WIDTHS = {
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const

export function DashboardTemplate({
  eyebrow,
  title,
  description,
  actions,
  stats,
  width = 'wide',
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** A row of <StatCard>s, laid out in a responsive grid above the body. */
  stats?: React.ReactNode
  width?: keyof typeof WIDTHS
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]}`}>
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{stats}</div>
      )}
      <div className="space-y-8">{children}</div>
    </div>
  )
}
