import Link from 'next/link'
import { Pencil, Zap } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, type Practice } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { RemovePracticeButton } from '@/components/practice/remove-practice-button'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { RowCard } from '@/components/cards/row-card'
import { SectionHeader } from '@/components/ui/section-header'

// The Pillar / cadence / reward chips under a "Your practices" row title.
function PracticeMeta({ p }: { p: { category: string | null; cadence: string | null; reward_note: string | null } }) {
  if (!p.category && !p.cadence && !p.reward_note) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {p.category && (
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
          {p.category.replace(/-/g, ' ')}
        </span>
      )}
      {p.cadence && <span className="text-subtle">{p.cadence}</span>}
      {p.reward_note && (
        <span className="inline-flex items-center gap-1 font-medium text-warning">
          <Zap className="h-3 w-3 fill-warning" aria-hidden />
          {p.reward_note}
        </span>
      )}
    </div>
  )
}

// "Your practices" rows fold onto the kit's RowCard (actions mode: the title is the
// link; the Log/Adopt/Edit controls sit right and never nest inside an anchor).
function MineRow({ p, byId, profileId }: { p: Practice; byId: Map<string, Pillar>; profileId: string }) {
  return (
    <li>
      <RowCard
        href={`/practices/${p.id}`}
        title={p.title}
        badge={p.domain_id && byId.has(p.domain_id) ? <PillarBadge name={byId.get(p.domain_id)!.name} /> : undefined}
        description={p.summary ?? p.description ?? undefined}
        meta={<PracticeMeta p={p} />}
        actions={
          <>
            {p.created_by === profileId && (
              <Link
                href={`/practices/${p.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
            <LogPracticeButton practiceId={p.id} />
            <RemovePracticeButton practiceId={p.id} title={p.title} />
          </>
        }
      />
    </li>
  )
}

// Practices layout module (ADR-270/294): "Your practices" — the member's adopted + built list in a
// readable column. Self-fetching RSC; renders nothing for a logged-out viewer or one with no
// practices yet. Keeps the id="practices-mine" anchor.
export async function PracticesMine() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const [mine, pillars] = await Promise.all([getMemberPractices(profileId), getPillars()])
  if (mine.length === 0) return null
  const byId = pillarsById(pillars)

  return (
    <section id="practices-mine" className="scroll-mt-20">
      <SectionHeader title="Your practices" count={mine.length} />
      <ul className="space-y-3">
        {mine.map((p) => (
          <MineRow key={p.id} p={p} byId={byId} profileId={profileId} />
        ))}
      </ul>
    </section>
  )
}
