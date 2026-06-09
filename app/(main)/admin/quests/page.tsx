import { Zap, Map, BookOpen, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { NewQuestChainButton, EditQuestChainButton, DeleteQuestChainButton, OfficialToggle } from './quest-controls'

type QuestChain = Database['public']['Tables']['quest_chains']['Row']
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
    { data: chains },
    { count: totalChains },
    { count: totalProgress },
    { data: journeys },
    { count: totalJourneys },
    { count: officialCount },
  ] = await Promise.all([
    typed.from('quest_chains').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
    typed.from('quest_chains').select('id', { count: 'exact', head: true }),
    typed.from('quest_progress').select('id', { count: 'exact', head: true }),
    admin
      .from('journey_plans')
      .select('id, title, slug, visibility, official, adopt_count, created_at, author:profiles(display_name, handle)')
      .order('created_at', { ascending: false })
      .limit(100),
    typed.from('journey_plans').select('id', { count: 'exact', head: true }),
    typed.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
  ] as const)

  const chainRows = (chains ?? []) as QuestChain[]
  const journeyRows = (journeys ?? []) as unknown as JourneyPlanRow[]

  return (
    <AdminPage
      title="Quests"
      eyebrow="Engage"
      description="Manage the gamified quest engine and the open journey library."
      width="wide"
      actions={<NewQuestChainButton />}
    >
      {/* Stats strip */}
      <AdminSection>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Quest chains" value={totalChains ?? 0} icon={Map} />
          <StatCard label="Members started" value={totalProgress ?? 0} icon={Users} />
          <StatCard label="Journey plans" value={totalJourneys ?? 0} icon={BookOpen} />
          <StatCard label="Official journeys" value={officialCount ?? 0} icon={Zap} />
        </div>
      </AdminSection>

      {/* Quest Chains */}
      <AdminSection title={`Quest Chains (${chainRows.length})`}>
        {chainRows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-16 text-center">
            <Map className="mx-auto mb-3 h-8 w-8 text-subtle" />
            <p className="text-sm font-medium text-text">No quest chains yet</p>
            <p className="mt-1 text-xs text-muted">Create the first chain using the button above.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* Header row (desktop) */}
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[1fr_80px_80px_90px_72px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Chain</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-center">Season</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-right">Zaps</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle text-right">Sort</span>
              <span className="sr-only">Actions</span>
            </div>

            <div className="divide-y divide-border/50">
              {chainRows.map((chain) => (
                <div
                  key={chain.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated sm:grid-cols-[1fr_80px_80px_90px_72px] sm:gap-4"
                >
                  {/* Name + slug */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none" aria-hidden="true">
                        {chain.icon}
                      </span>
                      <span className="truncate text-sm font-medium text-text">{chain.name}</span>
                    </div>
                    <span className="mt-0.5 block truncate text-xs text-subtle">{chain.slug}</span>
                    {chain.description && (
                      <span className="mt-0.5 block truncate text-xs text-muted">{chain.description}</span>
                    )}
                  </div>

                  {/* Season */}
                  <span className="hidden sm:block text-center text-sm tabular-nums text-muted">
                    {chain.season ?? '—'}
                  </span>

                  {/* Zaps reward */}
                  <span className="hidden sm:flex items-center justify-end gap-1 text-sm tabular-nums text-muted">
                    <Zap className="h-3 w-3 shrink-0 text-primary" />
                    {chain.zaps_reward}
                  </span>

                  {/* Sort order */}
                  <span className="hidden sm:block text-right text-sm tabular-nums text-subtle">
                    #{chain.sort_order}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <EditQuestChainButton chain={chain} />
                    <DeleteQuestChainButton id={chain.id} name={chain.name} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
                        {journey.quest_id && ' · in quest'}
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
