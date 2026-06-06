import {
  Zap, Gem, CheckCircle2, Circle, Dot, Brain, Activity, Sparkles, Palette,
  Link as LinkIcon, Crown, PenTool, Map as MapIcon, type LucideIcon,
} from 'lucide-react'
import { getQuestsData, type QuestView } from './actions'
import { StartQuestButton } from './start-quest-button'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { PageHeading } from '@/components/templates/page-heading'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Journeys · The Quest' }

// Quest icons are stored as lucide names; resolve the curated set we seed, with a
// calm fallback. Keeps the card visual without a full dynamic-icon resolver.
const ICONS: Record<string, LucideIcon> = {
  brain: Brain, activity: Activity, sparkles: Sparkles, palette: Palette,
  link: LinkIcon, crown: Crown, 'pen-tool': PenTool, map: MapIcon,
}

function QuestCard({ q }: { q: QuestView }) {
  const Icon = ICONS[q.icon] ?? MapIcon
  const RewardIcon = q.currency === 'zaps' ? Zap : Gem
  const rewardCls = q.currency === 'zaps' ? 'text-primary' : 'text-signal-strong'

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface/50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text">{q.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{q.description}</p>
        </div>
        {q.reward > 0 && (
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums ${rewardCls}`}>
            <RewardIcon className="h-3.5 w-3.5" strokeWidth={2.5} />+{q.reward}
          </span>
        )}
      </div>

      {/* Steps */}
      <ul className="mt-4 space-y-1.5">
        {q.steps.map((s) => {
          const StepIcon = s.done ? CheckCircle2 : s.current ? Dot : Circle
          const stepCls = s.done ? 'text-success' : s.current ? 'text-primary-strong' : 'text-subtle'
          const Cur = s.currency === 'zaps' ? Zap : Gem
          return (
            <li key={s.order} className="flex items-center gap-2 text-xs">
              <StepIcon className={`h-3.5 w-3.5 shrink-0 ${stepCls}`} />
              <span className={`flex-1 ${s.done ? 'text-subtle line-through' : 'text-text'}`}>{s.name}</span>
              {s.reward > 0 && (
                <span className={`inline-flex items-center gap-0.5 tabular-nums ${s.currency === 'zaps' ? 'text-primary' : 'text-signal-strong'}`}>
                  <Cur className="h-3 w-3" />+{s.reward}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* State / action */}
      <div className="mt-4">
        {q.completed ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Completed
          </p>
        ) : q.joined ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-subtle">
              <span>In progress</span>
              <span className="tabular-nums">{q.progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, q.progressPct)}%` }} />
            </div>
          </div>
        ) : (
          <CrewGateButton isCrew label="Start journey">
            <StartQuestButton chainId={q.id} />
          </CrewGateButton>
        )}
      </div>
    </div>
  )
}

export default async function QuestsPage() {
  const { pillars, isCrew } = await getQuestsData()

  return (
    <div>
      {!isCrew && <CrewPreviewBanner />}

      <PageHeading
        eyebrow="The Quest"
        title="Journeys"
        description="Seasonal tracks, one per Pillar. Start one and work its steps — online steps pay Gems, real-world steps pay Zaps. Your progress shows up in the Vault log."
        back={{ href: '/crew', label: 'Dashboard' }}
      />

      {pillars.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No journeys yet"
          description="Seasonal Journeys will appear here when the season opens."
        />
      ) : (
        <div className="space-y-10">
          {pillars.map((p) => (
            <section key={p.slug}>
              <SectionHeader title={p.name} count={p.quests.length} />
              <div className="grid gap-4 sm:grid-cols-2">
                {p.quests.map((q) => {
                  // Free members: lock the Start action behind the upgrade lightbox.
                  if (!isCrew && !q.joined && !q.completed) {
                    return (
                      <div key={q.id} className="relative">
                        <QuestCardLocked q={q} />
                      </div>
                    )
                  }
                  return <QuestCard key={q.id} q={q} />
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// Member-facing (free) variant: identical card, but the Start button opens the
// upgrade lightbox instead of joining.
function QuestCardLocked({ q }: { q: QuestView }) {
  const Icon = ICONS[q.icon] ?? MapIcon
  const RewardIcon = q.currency === 'zaps' ? Zap : Gem
  const rewardCls = q.currency === 'zaps' ? 'text-primary' : 'text-signal-strong'
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface/50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text">{q.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{q.description}</p>
        </div>
        {q.reward > 0 && (
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums ${rewardCls}`}>
            <RewardIcon className="h-3.5 w-3.5" strokeWidth={2.5} />+{q.reward}
          </span>
        )}
      </div>
      <ul className="mt-4 space-y-1.5">
        {q.steps.map((s) => (
          <li key={s.order} className="flex items-center gap-2 text-xs">
            <Circle className="h-3.5 w-3.5 shrink-0 text-subtle" />
            <span className="flex-1 text-text">{s.name}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <CrewGateButton isCrew={false} label="Start journey" />
      </div>
    </div>
  )
}
