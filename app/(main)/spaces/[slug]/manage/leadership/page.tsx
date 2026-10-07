import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { listProgramYearEventRows } from '@/lib/calendar/admin-calendar'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { formatEventWhen } from '@/lib/time/zone'
import { mensworkSeason } from '@/lib/theme/menswork'
import {
  buildProgramYear,
  overviewSections,
  pickProgramYear,
  programYearWindow,
  readProgramOverview,
  type ProgramEvent,
} from '@/lib/spaces/leadership'
import { DashboardTemplate } from '@/components/templates'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { YearCalendar } from './year-calendar'
import { OverviewEditor } from './overview-editor'

// THE LEADERSHIP PAGE (LIVE-862), in the Space console: the Yearly calendar and the Executive overview, for
// the people who run the Space. The Space's website links here with a labelled Admin link
// (components/sites/site-chrome.tsx); the website cannot know who is signed in, so THIS page is the gate.
//
// SECURITY: gated exactly like every console page. The Space must be visible to the caller and the caller a
// manager (resolveSpaceManageAccess: owner / admin / editor), or a platform janitor previewing read-only.
// Everyone else gets notFound(), so the route does not reveal itself. The overview's one write re-gates in
// its action. The calendar reads drafts on purpose (listProgramYearEventRows), which is why it sits
// behind the same gate as the team calendar.

export const metadata: Metadata = {
  title: 'Leadership',
  description: 'Your yearly calendar and executive overview, for the people who run your space.',
  robots: { index: false, follow: false },
}

type View = 'calendar' | 'overview'

export default async function SpaceLeadershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ view?: string; year?: string; edit?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const view: View = query.view === 'overview' ? 'overview' : 'calendar'
  const base = `/spaces/${space.slug}/manage/leadership`
  const brandName = space.brandName?.trim() || space.name
  const now = new Date()

  return (
    <DashboardTemplate
      eyebrow="Manage space"
      title="Leadership"
      description={`The yearly calendar and the executive overview for ${brandName}. Only your space's managers can open this page.`}
      back={{ href: `/spaces/${space.slug}/manage`, label: 'Manage space' }}
    >
      {staffViewing && !canManage && <StaffPreviewBanner spaceName={brandName} />}
      <UnderlineTabs
        label="Leadership sections"
        activeHref={view === 'overview' ? `${base}?view=overview` : base}
        tabs={[
          { href: base, label: 'Yearly calendar' },
          { href: `${base}?view=overview`, label: 'Executive overview' },
        ]}
      />
      {view === 'calendar' ? (
        <CalendarView spaceId={space.id} base={base} requestedYear={query.year} now={now} />
      ) : (
        <OverviewView
          slug={space.slug}
          markdown={readProgramOverview(space.preferences)}
          canEdit={canManage}
          startEditing={query.edit === '1'}
        />
      )}
    </DashboardTemplate>
  )
}

async function CalendarView({
  spaceId,
  base,
  requestedYear,
  now,
}: {
  spaceId: string
  base: string
  requestedYear: string | undefined
  now: Date
}) {
  // An explicit ?year= within reach of today is honored; otherwise the year is derived from today and
  // the events (pickProgramYear), so one read covers both candidate years.
  const thisYear = now.getUTCFullYear()
  const asked = Number(requestedYear)
  const fixed = Number.isInteger(asked) && asked >= thisYear - 5 && asked <= thisYear + 5 ? asked : null
  const window = fixed
    ? programYearWindow(fixed)
    : { fromDay: programYearWindow(thisYear).fromDay, toDay: programYearWindow(thisYear + 1).toDay }
  const rows = await listProgramYearEventRows(spaceId, window)

  const events: ProgramEvent[] = rows.flatMap((ev) => {
    const dayKey = eventDayKey(ev.starts_at)
    if (!dayKey) return []
    const end = ev.ends_at ? eventDayKey(ev.ends_at) : null
    return [
      {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        endDayKey: end && end > dayKey ? end : null,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }) || null,
        draft: ev.status !== 'published',
        cancelled: !!ev.is_cancelled,
      },
    ]
  })
  const year = fixed ?? pickProgramYear(now, events.map((e) => e.dayKey))
  const { fromDay, toDay } = programYearWindow(year)
  const inYear = events.filter((e) => e.dayKey >= fromDay && e.dayKey < toDay)

  return (
    <YearCalendar
      year={year}
      months={buildProgramYear(year, inYear, now)}
      currentSeason={mensworkSeason(now)}
      yearHref={(y) => `${base}?year=${y}`}
      eventCount={inYear.length}
    />
  )
}

function OverviewView({
  slug,
  markdown,
  canEdit,
  startEditing,
}: {
  slug: string
  markdown: string
  canEdit: boolean
  startEditing: boolean
}) {
  const sections = overviewSections(markdown)
  return (
    <div className="space-y-6">
      {canEdit && <OverviewEditor slug={slug} initial={markdown} startOpen={startEditing || !markdown} />}
      {!markdown ? (
        <EmptyState
          title="No executive overview yet"
          description="Write the overview your leaders work from: what the program is, how it runs, and the decisions still open."
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {sections.length > 0 && (
            <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
              <p className="eyebrow text-muted">Contents</p>
              <ol className="mt-2 space-y-1">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-1 rounded-control px-1 py-1 text-body-sm text-text hover:bg-surface-elevated">
                      <span className="tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <article className="min-w-0">
            <HelpMarkdown>{markdown}</HelpMarkdown>
          </article>
        </div>
      )}
    </div>
  )
}
