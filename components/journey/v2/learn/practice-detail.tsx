import Link from 'next/link'
import { Repeat, Clock, Zap, ArrowUpRight } from 'lucide-react'
import type { RankedPractice } from '@/lib/practices'
import type { Pillar } from '@/lib/pillars'
import { practiceZapValue } from '@/lib/zaps'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { PillarBadge } from '@/components/practice/pillar-badge'

// Journeys v2 — the rich practice detail for a selected `practice` step in the learn player. A
// follower opening a practice lesson should see the real thing they're being asked to do: the
// summary, how often + how long, which Pillar, the per-log reward, and the full library write-up
// ("Why it works / How to do it / In The Quest") rendered as markdown. A Server Component so the
// markdown renders without shipping react-markdown to the client — the page pre-renders one per
// practice step and hands the player a node map (the RSC interleaving pattern). Token colors only.

export function PracticeDetail({
  practice,
  pillar,
}: {
  practice: RankedPractice
  /** The step's Pillar (the block's domain_id mapped to a Pillar), for the badge. Null when none. */
  pillar: Pillar | null
}) {
  const zaps = practiceZapValue(practice)
  const facts: { icon: typeof Repeat; label: string; value: string }[] = [
    { icon: Repeat, label: 'Cadence', value: practice.cadence ?? 'Your call' },
    ...(practice.duration_min ? [{ icon: Clock, label: 'Time', value: `${practice.duration_min} min` }] : []),
    { icon: Zap, label: 'Reward per log', value: `+${zaps} zaps` },
  ]

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-border bg-surface-elevated/40 p-4 sm:p-5">
      {/* The plain-language "what this is", with its Pillar — the hook before the full guide. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {pillar && <PillarBadge name={pillar.name} />}
          <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">The practice</span>
        </div>
        {practice.summary && <p className="text-sm leading-relaxed text-text">{practice.summary}</p>}
      </div>

      {/* Cadence · time · reward — the at-a-glance facts a follower needs to do it. */}
      <div className="flex flex-wrap gap-2">
        {facts.map((f) => (
          <span
            key={f.label}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-2xs font-medium text-muted"
          >
            <f.icon className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
            <span className="font-semibold text-text">{f.value}</span> {f.label}
          </span>
        ))}
      </div>

      {/* The full library write-up: "Why it works / How to do it / In The Quest", as markdown. */}
      {practice.body ? (
        <div className="border-t border-border pt-1">
          <HelpMarkdown>{practice.body}</HelpMarkdown>
        </div>
      ) : practice.description ? (
        <p className="border-t border-border pt-4 text-sm leading-relaxed text-muted">{practice.description}</p>
      ) : null}

      {/* A quiet cross-link to the practice's own page (claim / log / Mindless live there). */}
      <Link
        href={`/practices/${practice.slug ?? practice.id}`}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        Open this practice <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
      </Link>
    </div>
  )
}
