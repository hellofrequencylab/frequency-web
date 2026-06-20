import { Zap } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, getPracticesToLogToday, type Practice } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { PracticeRowActions } from '@/components/practice/practice-row-actions'
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
// link; the action row sits right and never nests inside an anchor). The row is kept
// tight (one button + one link, B.3): a "Log practice" button and an explicit "View
// practice" link, with Edit/Remove tucked into the row's overflow menu. After a
// successful log the action row collapses (B.4), which lives in the client wrapper.
function MineRow({
  p,
  byId,
  profileId,
  loggedToday,
}: {
  p: Practice
  byId: Map<string, Pillar>
  profileId: string
  loggedToday: boolean
}) {
  return (
    <li>
      <RowCard
        href={`/practices/${p.id}`}
        title={p.title}
        badge={p.domain_id && byId.has(p.domain_id) ? <PillarBadge name={byId.get(p.domain_id)!.name} /> : undefined}
        description={p.summary ?? p.description ?? undefined}
        meta={<PracticeMeta p={p} />}
        actions={
          <PracticeRowActions
            practiceId={p.id}
            title={p.title}
            href={`/practices/${p.id}`}
            loggedToday={loggedToday}
            isOwner={p.created_by === profileId}
          />
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

  // Seed the per-practice "logged today" state from the server (B.4) so a practice
  // already logged today paints in the collapsed state, never flashing a live button.
  // getPracticesToLogToday returns the NOT-yet-logged set; the complement is logged.
  const [mine, pillars, toLog] = await Promise.all([
    getMemberPractices(profileId),
    getPillars(),
    getPracticesToLogToday(profileId),
  ])
  if (mine.length === 0) return null
  const byId = pillarsById(pillars)
  const toLogIds = new Set(toLog.map((p) => p.id))

  return (
    <section id="practices-mine" className="scroll-mt-20">
      <SectionHeader title="Your practices" count={mine.length} />
      <ul className="space-y-3">
        {mine.map((p) => (
          <MineRow key={p.id} p={p} byId={byId} profileId={profileId} loggedToday={!toLogIds.has(p.id)} />
        ))}
      </ul>
    </section>
  )
}
