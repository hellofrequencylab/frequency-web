import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarRange, Compass, ArrowRight, Sparkles, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import { PillarBalance } from '@/components/admin/pillar-balance'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSeasonDetail, type SeasonJourney } from './data'
import { SeasonEditor } from './season-editor'
import { StateBadge } from '../state-badge'

// The Season Composer — the no-SQL surface where an operator composes a whole season.
// Detail template (PAGE-FRAMEWORK §8.1): the season as the entity, an editable identity
// + lifecycle band up top, and the drill-down to its Journeys below (each a link out to
// the existing Journey editor, with its per-Pillar Zap balance shown inline). The heavy
// Journey reads sit behind a per-section <Suspense> so the header never waits on them.

export const dynamic = 'force-dynamic'

export default async function SeasonComposerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  // A light header read (identity + status) — the Journeys load separately behind Suspense.
  const db = createAdminClient()
  const { data: seasonRow } = await db
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .eq('id', id)
    .maybeSingle()
  const season = seasonRow as {
    id: string
    season_number: number
    name: string
    theme: string | null
    starts_at: string | null
    ends_at: string | null
    status: string
  } | null
  if (!season) notFound()

  return (
    <AdminTemplate
      title={season.name}
      eyebrow={`Season ${season.season_number}`}
      icon={Compass}
      description="Compose the season: edit its identity and window, move it through its lifecycle, and tune its Journeys. Each Journey links out to its full editor."
      width="wide"
      back={{ href: '/admin/content/seasons', label: 'Seasons' }}
      actions={<StateBadge status={season.status} />}
    >
      <AdminSection
        title="Season"
        description={
          janitor
            ? 'Edit the name, theme, and window, then move the season through Draft, Scheduled, Live, and Ended.'
            : 'The season identity and lifecycle. Editing is janitor-only.'
        }
      >
        <SeasonEditor
          season={{
            id: season.id,
            seasonNumber: season.season_number,
            name: season.name,
            theme: season.theme,
            startsAt: season.starts_at,
            endsAt: season.ends_at,
            status: season.status,
          }}
          canEdit={janitor}
        />
      </AdminSection>

      <AdminSection
        title="Journeys"
        description="The season ships three official Journeys, each with weight-classed Practices across the four Pillars and an Expression Challenge capstone."
      >
        <Suspense fallback={<JourneysFallback />}>
          <SeasonJourneys id={id} />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

function JourneysFallback() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  )
}

async function SeasonJourneys({ id }: { id: string }) {
  const detail = await loadSeasonDetail(id)
  if (!detail) notFound()

  if (!detail.questId) {
    return (
      <EmptyState
        variant="first-use"
        icon={Compass}
        title="No Quest for this season yet"
        description="Official Journeys hang under the season's Quest. Once the Quest exists, its Journeys appear here to compose."
      />
    )
  }

  if (detail.journeys.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        icon={Compass}
        title="No Journeys yet"
        description="Add the season's three official Journeys. Build one in the Journey editor, then make it official under this Quest from the Journeys curation page."
        action={
          <Link
            href="/admin/content/journeys"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            Open Journeys curation <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />
    )
  }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null)

  return (
    <div className="space-y-3">
      {detail.journeys.map((j) => (
        <JourneyRow key={j.id} journey={j} fmt={fmt} />
      ))}
      <p className="text-xs text-muted">
        Add or link a Journey from{' '}
        <Link
          href="/admin/content/journeys"
          className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
        >
          Journeys curation <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        . Expression Challenges are tuned in{' '}
        <Link
          href="/admin/content/challenges"
          className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
        >
          Challenges <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        .
      </p>
    </div>
  )
}

function JourneyRow({
  journey,
  fmt,
}: {
  journey: SeasonJourney
  fmt: (d: string | null) => string | null
}) {
  const windowLabel =
    journey.windowStartsAt || journey.windowEndsAt
      ? `${fmt(journey.windowStartsAt) ?? 'Open'} to ${fmt(journey.windowEndsAt) ?? 'Open'}`
      : 'Always open'

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-bold text-text">{journey.title}</h3>
            <StatusChip tone="neutral" size="sm">
              {journey.practiceCount} {journey.practiceCount === 1 ? 'Practice' : 'Practices'}
            </StatusChip>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="tabular-nums">{windowLabel}</span>
            </span>
            <span aria-hidden className="text-subtle">·</span>
            {journey.pillarMix.length > 0 ? (
              <span>{journey.pillarMix.map((p) => p.name).join(' · ')}</span>
            ) : (
              <span className="text-subtle">No Pillars yet</span>
            )}
            <span aria-hidden className="text-subtle">·</span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              {journey.expression ? (
                <StatusChip tone="success" size="sm">Expression set</StatusChip>
              ) : (
                <StatusChip tone="warning" size="sm">No Expression Challenge</StatusChip>
              )}
            </span>
          </div>
        </div>
        <Link
          href={`/journeys/${journey.slug}/edit`}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          Author <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="mt-3">
        <PillarBalance practices={journey.practices} />
      </div>
    </div>
  )
}
