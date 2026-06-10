import type { SupabaseClient } from '@supabase/supabase-js'
import { Trophy, Target, Flame, CheckCircle2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { challengeCompletionRates } from '@/lib/admin/content-signals'
import { ChallengeEditor, ChallengeCreateForm, type ChallengeRow } from './challenge-editor'

// Season challenges editor: tune the active season's challenges (name, story,
// difficulty, target, Zap reward) and add new ones. Completion numbers ride
// along so tuning is grounded in what members actually finish.

export default async function AdminContentChallengesPage() {
  await requireAdmin('host', { staff: 'community' })

  const ub = createAdminClient() as unknown as SupabaseClient
  const [season, completion, { data: challengeRows }] = await Promise.all([
    getCurrentSeason(),
    challengeCompletionRates(),
    ub
      .from('season_challenges')
      .select('id, season, slug, name, description, category, difficulty, target, zaps_reward, sort_order')
      .order('season', { ascending: false })
      .order('sort_order', { ascending: true }),
  ])

  const all = ((challengeRows ?? []) as ChallengeRow[]).map((c) => ({
    ...c,
    started: completion.get(c.id)?.started ?? 0,
    completed: completion.get(c.id)?.completed ?? 0,
    rate: completion.get(c.id)?.rate ?? 0,
  }))
  const current = season ? all.filter((c) => c.season === season.season_number) : []
  const past = season ? all.filter((c) => c.season !== season.season_number) : all
  const totalStarted = current.reduce((s, c) => s + c.started, 0)
  const totalCompleted = current.reduce((s, c) => s + c.completed, 0)

  return (
    <AdminPage
      title="Challenges"
      eyebrow="Content"
      description="The season's challenge board. Edits go live immediately; completion numbers show what members actually finish."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Active season"
            value={season ? season.name : 'None'}
            icon={Trophy}
            size="sm"
            href="/admin/content/seasons"
          />
          <StatCard label="Challenges this season" value={current.length} icon={Target} />
          <StatCard label="Members in progress" value={totalStarted} icon={Flame} />
          <StatCard label="Completions" value={totalCompleted} icon={CheckCircle2} />
        </div>
      </AdminSection>

      {season ? (
        <>
          <AdminSection
            title={`${season.name} challenges (${current.length})`}
            description="Edit a row and save it. Target is the count to hit; the Zap reward pays on completion."
          >
            {current.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No challenges this season"
                description="Add the first one below. Members see it on the challenge board right away."
              />
            ) : (
              <ChallengeEditor challenges={current} />
            )}
          </AdminSection>

          <AdminSection title="Add a challenge" description="Lands on this season's board. Criteria wiring is set by engineering; the board copy and reward are yours.">
            <ChallengeCreateForm />
          </AdminSection>
        </>
      ) : (
        <AdminSection>
          <EmptyState
            icon={Trophy}
            title="No active season"
            description="Challenges attach to the active season. Create or open a season first."
          />
        </AdminSection>
      )}

      {past.length > 0 && (
        <AdminSection title={`Past seasons (${past.length})`} description="Read-only history. Past boards stay as they ran.">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/30">
              {past.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-16 shrink-0 text-xs font-semibold text-subtle">S{c.season}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text">{c.name}</span>
                  <span className="text-xs tabular-nums text-subtle">
                    {c.completed}/{c.started} completed
                  </span>
                </div>
              ))}
            </div>
          </div>
        </AdminSection>
      )}
    </AdminPage>
  )
}
