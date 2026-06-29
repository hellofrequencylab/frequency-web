import Link from 'next/link'
import { ExternalLink, Wand2 } from 'lucide-react'
import { mostRemixed } from '@/lib/practices/lineage'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'

// Admin practices layout module (ADR-438 Phase 3 "Grow", PRACTICE-LIBRARY §6): the operator's
// remix levers. Self-fetching async RSC; reads mostRemixed (includeHidden, so an operator sees the
// full picture, not just the public slice) and renders a ranked "most remixed originals" list —
// title + remix count + creator name, each linking to the practice. The headline StatCard band
// gives the lever at a glance (how many originals have been remixed, the deepest tree). Returns
// null when nothing has been remixed yet, per the module contract.
//
// PARKING-LOT: "mark remix seeds" (flag the originals worth seeding more remixes off of) implies a
// new practices column + migration. This UI pass does NOT add a migration (out of scope), so the
// seed-marking flag is parked — the list below surfaces the same insight read-only (the most
// remixed originals ARE the natural seeds), and a future Phase can add the write.

const PANEL_LIMIT = 12

export async function PracticeRemixLevers() {
  const rows = await mostRemixed({ limit: PANEL_LIMIT, includeHidden: true })
  if (rows.length === 0) return null

  // Resolve creator ids → names (display_name, then handle), same pattern as the curation table.
  // A null creator is one of Frequency's house practices.
  const admin = createAdminClient()
  const creatorIds = [...new Set(rows.map((r) => r.creator).filter((c): c is string => !!c))]
  const { data: creatorRows } = creatorIds.length
    ? await admin.from('profiles').select('id, display_name, handle').in('id', creatorIds)
    : { data: [] as { id: string; display_name: string | null; handle: string | null }[] }
  const creatorName = new Map(
    ((creatorRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      r.display_name ?? (r.handle ? `@${r.handle}` : 'Unknown'),
    ]),
  )
  const nameFor = (id: string | null) => (id == null ? 'Frequency' : (creatorName.get(id) ?? 'Unknown'))

  const totalRemixes = rows.reduce((n, r) => n + r.remixCount, 0)
  const topCount = rows[0]?.remixCount ?? 0

  return (
    <section className="space-y-3">
      <SectionHeader title="Most remixed" count={rows.length} />

      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
        <StatCard label="Originals remixed" value={rows.length} icon={Wand2} />
        <StatCard label="Remixes spawned" value={totalRemixes} icon={Wand2} />
        <StatCard label="Most remixed" value={topCount} detail="off one original" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <ol className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <li key={r.rootId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/practices/${r.rootId}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-text hover:underline"
                >
                  <span className="min-w-0 truncate">{r.title || 'Untitled practice'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted">by {nameFor(r.creator)}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-subtle">
                {r.remixCount} {r.remixCount === 1 ? 'remix' : 'remixes'}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
