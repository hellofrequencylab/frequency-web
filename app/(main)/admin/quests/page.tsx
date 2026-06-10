import { Zap, BookOpen, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { OfficialToggle } from './quest-controls'

// The Journeys admin surface. The legacy action-chain engine this page once
// managed is fully retired (ADR-152 Phase B3 — `journey_plans` is the single
// Journey spine; the dropped engine is gone from prod), so what remains is the
// living half: the open Journey library, with the staff "Official" curation toggle.

// Supabase returns joined rows as arrays; use a loose intermediate type.
interface JourneyPlanRow {
  id: string
  title: string
  slug: string
  emoji?: string | null
  visibility: string
  official: boolean
  adopt_count: number
  quest_id?: string | null
  created_at: string
  author: { display_name: string | null; handle: string | null }[] | null
}

const VISIBILITY_STYLES: Record<string, { label: string; cls: string }> = {
  public:   { label: 'Public',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  unlisted: { label: 'Unlisted', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  private:  { label: 'Private',  cls: 'bg-border/60 text-muted dark:bg-border/20 dark:text-muted' },
}

export default async function AdminQuestsPage() {
  await requireAdmin('host', { staff: 'community' })

  // Untyped handle: journey_plans.author join isn't in generated types
  const admin = createAdminClient() as unknown as SupabaseClient
  const typed = createAdminClient()

  const [
    { data: journeys },
    { count: totalJourneys },
    { count: officialCount },
    { count: adoptionCount },
  ] = await Promise.all([
    admin
      .from('journey_plans')
      .select('id, title, slug, visibility, official, adopt_count, created_at, author:profiles(display_name, handle)')
      .order('created_at', { ascending: false })
      .limit(100),
    typed.from('journey_plans').select('id', { count: 'exact', head: true }),
    typed.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    typed.from('journey_plan_adoptions').select('id', { count: 'exact', head: true }).eq('active', true),
  ] as const)

  const journeyRows = (journeys ?? []) as unknown as JourneyPlanRow[]

  return (
    <AdminPage
      title="Journeys"
      eyebrow="Engage"
      description="The open Journey library. Curate which Journeys carry the Official mark."
      width="wide"
    >
      {/* Stats strip */}
      <AdminSection>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Journey plans" value={totalJourneys ?? 0} icon={BookOpen} />
          <StatCard label="Official journeys" value={officialCount ?? 0} icon={Zap} />
          <StatCard label="Active adoptions" value={adoptionCount ?? 0} icon={Users} />
        </div>
      </AdminSection>

      {/* Journey Library */}
      <AdminSection title={`Journey Library (${journeyRows.length} shown)`}>
        {journeyRows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-16 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-subtle" />
            <p className="text-sm font-medium text-text">No journey plans yet</p>
            <p className="mt-1 text-xs text-muted">Journey plans created by members will appear here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* Header row (desktop) */}
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[1fr_120px_100px_64px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Journey</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Author</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Visibility</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-center">Official</span>
            </div>

            <div className="divide-y divide-border/50">
              {journeyRows.map((journey) => {
                const vis = VISIBILITY_STYLES[journey.visibility] ?? VISIBILITY_STYLES['private']
                const author = Array.isArray(journey.author) ? journey.author[0] ?? null : journey.author
                return (
                  <div
                    key={journey.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated sm:grid-cols-[1fr_120px_100px_64px] sm:gap-4"
                  >
                    {/* Title + slug */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {journey.emoji && (
                          <span className="text-base leading-none" aria-hidden="true">
                            {journey.emoji}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium text-text">{journey.title}</span>
                        {journey.official && (
                          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold text-primary">
                            Official
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {journey.adopt_count} adopted
                      </span>
                    </div>

                    {/* Author */}
                    <span className="hidden sm:block truncate text-xs text-muted">
                      {author?.display_name ?? author?.handle ?? 'Unknown'}
                    </span>

                    {/* Visibility badge */}
                    <span className={`hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${vis.cls}`}>
                      {vis.label}
                    </span>

                    {/* Official toggle */}
                    <div className="flex justify-center">
                      <OfficialToggle id={journey.id} isOfficial={journey.official} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </AdminSection>
    </AdminPage>
  )
}
