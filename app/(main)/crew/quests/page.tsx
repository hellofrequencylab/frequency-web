import Link from 'next/link'
import { Map as MapIcon, ArrowRight } from 'lucide-react'
import { getSeasonalQuests, type QuestJourneyCard } from '@/lib/quests'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { accentColor, accentTint } from '@/lib/studio/accents'

export const metadata = { title: 'Quests · The Quest' }

// A Quest's Journey → links to the existing Journey detail (which shows its
// practices + the free Adopt flow). The Quest is just the seasonal container.
function JourneyCard({ j }: { j: QuestJourneyCard }) {
  return (
    <Link
      href={`/journeys/${j.slug}`}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-surface/50 p-5 transition-colors hover:border-primary"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
        style={{ backgroundColor: accentTint(j.accent, 16), color: accentColor(j.accent) }}
      >
        {j.emoji ?? <MapIcon className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-text">{j.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {j.practiceCount} {j.practiceCount === 1 ? 'practice' : 'practices'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-primary-strong" />
    </Link>
  )
}

export default async function QuestsPage() {
  const quests = await getSeasonalQuests()

  return (
    <IndexTemplate
      eyebrow="The Quest"
      title="Quests"
      description="Each season's Quest gathers a set of Journeys — one per Pillar — to move through. Every Journey is a handful of practices; start any of them free, and your progress rides your daily practice log."
      back={{ href: '/crew', label: 'Dashboard' }}
    >
      {quests.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No quests yet"
          description="Seasonal Quests appear here when the season opens."
        />
      ) : (
        <div className="space-y-10">
          {quests.map((q) => (
            <section key={q.id}>
              <SectionHeader title={q.name} count={q.journeys.length} />
              {q.description && <p className="mb-3 -mt-1 text-sm text-muted">{q.description}</p>}
              {q.journeys.length === 0 ? (
                <EmptyState
                  icon={MapIcon}
                  title="Journeys coming soon"
                  description="This Quest's Journeys are being curated."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {q.journeys.map((j) => (
                    <JourneyCard key={j.slug} j={j} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
