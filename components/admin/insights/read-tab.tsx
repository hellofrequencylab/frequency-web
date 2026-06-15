import { Sparkles } from 'lucide-react'
import { DashArea, TileGrid, Tile, SeverityChip } from '@/components/admin/dash'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { EmptyState } from '@/components/ui/empty-state'
import { getEngagementRead, type Severity } from '@/lib/analytics/engagement-read'

// The "Read" tab of the consolidated Insights suite (ADR-263) — formerly /admin/insights.
// The Engagement Read (ENGAGEMENT-MARKETING-ENGINE.md Phase D): reads the live signal and
// names what's working, what's jamming, and what to do. Synthesis is deterministic + grounded.

// The Read's severities map onto the shared SeverityChip vocabulary.
const SEVERITY_CHIP: Record<Severity, 'risk' | 'watch' | 'good'> = {
  risk: 'risk',
  watch: 'watch',
  good: 'good',
}

export async function ReadTab() {
  const read = await getEngagementRead()

  return (
    <DashArea
      icon={Sparkles}
      label="The read"
      blurb="Vera reads the live engagement signal and names the next move. Start with whatever she flags as needing attention."
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <Tile span={3}>
          <p className="text-sm font-medium leading-relaxed text-text">{read.summary}</p>
        </Tile>

        {read.insights.length === 0 ? (
          <Tile span={3}>
            <EmptyState
              variant="first-use"
              icon={Sparkles}
              title="No signal to read yet"
              description="Insights appear here once members are active and the signal has something to say."
            />
          </Tile>
        ) : (
          <Tile label="What needs attention" span={3}>
            <ul className="space-y-3.5">
              {read.insights.map((i) => (
                <li key={i.id} className="flex items-start gap-3">
                  <SeverityChip severity={SEVERITY_CHIP[i.severity]} />
                  <div className="min-w-0 text-sm leading-snug">
                    <span className="font-semibold text-text">{i.title}.</span>{' '}
                    <span className="text-muted">{i.finding}</span>{' '}
                    <span className="text-text">→ {i.recommendation}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}
