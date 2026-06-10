import { Users, UserPlus, UserX, Activity, Sparkles } from 'lucide-react'
import { getMarketRead, type ContentIdea, type PainPoint } from '@/lib/marketing/market-read'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

// "The Market Read" — the AI marketing operator's outbound-acquisition wedge.
// Reads live in-app signal, names the market's pain points, and drafts resonant
// content for each. Deterministic synthesis for now (see lib/marketing/market-read.ts);
// the live Claude operator + GA / social-listening signals slot in behind it.
export default async function MarketReadPage() {
  const { signal, painPoints } = await getMarketRead()
  const engDelta = signal.engagementThisWeek - signal.engagementPriorWeek

  return (
    <DashboardTemplate
      eyebrow="Marketing"
      title="Market read"
      description="The operator listens to live signal, names what the market is aching for, and drafts outbound content that speaks to it (a magical connection, not an advertisement). Drafts are proposals: nothing reaches the public until you approve it."
    >
      {/* ── Listen: live in-app signal ─────────────────────── */}
      <section>
        <SectionHeader title="Live signal" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Members" value={signal.totalMembers.toLocaleString()} icon={Users} />
          <StatCard label="New this week" value={signal.newThisWeek.toLocaleString()} icon={UserPlus} />
          <StatCard label="Without a circle" value={signal.newWithoutCircle.toLocaleString()} icon={UserPlus} />
          <StatCard label="Gone quiet" value={signal.quietMembers.toLocaleString()} icon={UserX} />
          <StatCard
            label="Engagement"
            value={signal.engagementThisWeek.toLocaleString()}
            icon={Activity}
            delta={{
              label: `${engDelta >= 0 ? '+' : ''}${engDelta.toLocaleString()} vs last week`,
              trend: engDelta > 0 ? 'up' : engDelta < 0 ? 'down' : 'flat',
            }}
          />
        </div>
        <p className="mt-3 text-xs text-subtle">
          Prototype: in-app behavior is live. GA acquisition + external social listening slot in here next.
        </p>
      </section>

      {/* ── Read the ache + drafted content ────────────────── */}
      <section>
        <SectionHeader title="What the market is aching for" count={painPoints.length} />
        <div className="space-y-6">
          {painPoints.map((p) => (
            <PainPointCard key={p.id} pain={p} />
          ))}
        </div>
      </section>

      <div className="rounded-2xl bg-surface-elevated/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <Sparkles className="w-4 h-4 text-primary-strong" />
          How this grows
        </p>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          The synthesis + drafting are deterministic today (the same copilot-first pattern as the
          Agent console). Next: a live Claude operator drafts behind this read; low-risk drafts can
          auto-publish once the audit log earns trust (graduated autonomy), while anything public
          always waits for a human. Member data only ever informs the <em>aggregate</em> ache. It
          is never exposed in outbound.
        </p>
      </div>
    </DashboardTemplate>
  )
}

function PainPointCard({ pain }: { pain: PainPoint }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-text">{pain.title}</h3>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                pain.basis === 'live' ? 'bg-success-bg text-success' : 'bg-surface-elevated text-subtle'
              }`}
            >
              {pain.basis === 'live' ? 'Live signal' : 'Baseline'}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-signal-bg text-signal-strong font-medium">
              {pain.persona}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text leading-snug text-balance">“{pain.ache}”</p>
          <p className="mt-2 text-sm text-muted leading-relaxed">{pain.evidence}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {pain.ideas.map((idea, i) => (
          <IdeaCard key={i} idea={idea} />
        ))}
      </div>
    </section>
  )
}

const CHANNEL_STYLE: Record<ContentIdea['channel'], string> = {
  Social: 'bg-primary-bg text-primary-strong',
  Ad: 'bg-signal-bg text-signal-strong',
  Hook: 'bg-warning-bg text-warning',
}

function IdeaCard({ idea }: { idea: ContentIdea }) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface-elevated/60 p-4">
      <span className={`self-start text-xs px-1.5 py-0.5 rounded-md font-medium ${CHANNEL_STYLE[idea.channel]}`}>
        {idea.channel}
      </span>
      <p className="mt-2 text-sm font-semibold text-text leading-snug">{idea.hook}</p>
      {idea.body && <p className="mt-1.5 text-sm text-muted leading-relaxed">{idea.body}</p>}
      <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-subtle">
        <span>Draft · awaiting approval</span>
      </div>
    </div>
  )
}
