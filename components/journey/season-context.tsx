import { CalendarRange } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { seasonAct } from '@/lib/journey-quest-clock'

// Season context (docs/JOURNEYS.md §3, Acts). Shows where the member is in the 13-week season:
// the season name + theme, the week (Week N of 13), and the current Act (Open / Deepen / Land).
// Async Server Component — wrap in <Suspense>. Off-season (no week) renders nothing. Token
// colors, no em dashes (CONTENT-VOICE); member-facing copy says "season", never "quest clock".

export async function SeasonContext({
  questId,
  seasonWeek,
}: {
  questId: string | null
  seasonWeek: number | null
}) {
  const act = seasonAct(seasonWeek)
  if (!questId || seasonWeek == null || !act) return null

  let seasonName: string | null = null
  let theme: string | null = null
  try {
    const admin = createAdminClient() as unknown as SupabaseClient
    const { data: q } = await admin.from('quests').select('season, name').eq('id', questId).maybeSingle()
    const qr = q as { season: number | null; name: string | null } | null
    seasonName = qr?.name ?? null
    if (qr?.season != null) {
      const { data: s } = await admin.from('seasons').select('name, theme').eq('season_number', qr.season).maybeSingle()
      const sr = s as { name: string | null; theme: string | null } | null
      if (sr?.name) seasonName = sr.name
      theme = sr?.theme ?? null
    }
  } catch {
    // fall back to the Act + week only
  }

  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-muted">
          <CalendarRange className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {seasonName ?? 'This season'} · Week {seasonWeek} of 13
          </p>
          {theme && <p className="truncate text-xs text-muted">{theme}</p>}
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-subtle">
          Act {act.act} · {act.name}
        </span>
      </div>
    </section>
  )
}
