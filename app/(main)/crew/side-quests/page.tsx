import { notFound } from 'next/navigation'
import { Award, Zap } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { listSideQuests } from '@/lib/side-quests'
import { DashboardTemplate } from '@/components/templates'
import { ClaimButton } from './claim-button'

// Side Quests board (ADR-300 Part 3): reward-only missions a member takes on for bonus Zaps and a
// special badge. They do NOT count toward the four-Pillar Signature — pure extra credit.
export const dynamic = 'force-dynamic'

export default async function SideQuestsPage() {
  const caller = await getCallerProfile()
  if (!caller) notFound()

  const quests = await listSideQuests(caller.id)
  const done = quests.filter((q) => q.claimed).length

  return (
    <DashboardTemplate
      eyebrow="The Quest"
      title="Side Quests"
      description="Optional missions for bonus Zaps and a badge to keep. They don't touch your four-Pillar balance, they're just extra credit for going further."
    >
      {quests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No Side Quests yet. Check back soon.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">{done} of {quests.length} finished.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {quests.map((q) => (
              <li
                key={q.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 ${q.claimed ? 'border-success/30 bg-success/5' : 'border-border bg-surface'}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-bg text-signal-strong">
                  <Award className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text">{q.name}</h3>
                    <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold capitalize text-muted">{q.tier}</span>
                  </div>
                  {q.description && <p className="mt-1 text-sm text-muted">{q.description}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-signal-strong">
                      <Zap className="h-3.5 w-3.5" aria-hidden /> +{q.zapsReward} Zaps
                    </span>
                    <ClaimButton achievementId={q.id} claimed={q.claimed} zaps={q.zapsReward} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardTemplate>
  )
}
