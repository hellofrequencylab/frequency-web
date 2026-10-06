import Link from 'next/link'
import { Gift, ScanLine } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { hasFinishedQuest, listQuestSponsorRewards } from '@/lib/partners/read'

// A Quest's sponsor rewards (LIVE-673, owner ruling "Sponsors with goods"): what a partner gives a
// member who finishes the Quest, shown on each of its official Journeys. Goods or a discount,
// redeemed in person at the partner's plaque, never cash. Self-fetching, and renders nothing when
// no partner sponsors the Quest, which is most Quests.
export async function QuestSponsorRewards({ questId, profileId }: { questId: string; profileId: string | null }) {
  const [rewards, earned] = await Promise.all([
    listQuestSponsorRewards(questId),
    profileId ? hasFinishedQuest(profileId, questId) : Promise.resolve(false),
  ])
  if (rewards.length === 0) return null

  return (
    <section className="mt-4 rounded-card border border-border bg-surface p-4">
      <SectionHeader title="Quest rewards" count={rewards.length} />
      <ul className="space-y-3">
        {rewards.map((r) => (
          <li key={r.offerId} className="flex items-start gap-2.5">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">{r.title}</p>
              <p className="text-meta text-muted">
                From{' '}
                <Link href={`/partners/${r.partner.slug}`} className="font-medium text-text hover:underline">
                  {r.partner.name}
                </Link>
                {r.partner.city ? `, ${r.partner.city}` : ''}
              </p>
              {r.memberTerms && <p className="text-meta text-subtle">{r.memberTerms}</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-meta text-muted">
        <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {earned
          ? 'You finished this Quest. Tap the partner’s plaque in person to claim it.'
          : 'Finish a Journey in this Quest, then tap the partner’s plaque in person to claim it.'}
      </p>
    </section>
  )
}
