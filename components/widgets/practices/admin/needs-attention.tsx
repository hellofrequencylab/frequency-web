import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { needsAttention, type AttentionReason } from '@/lib/practices/clean'
import { SectionHeader } from '@/components/ui/section-header'
import { StatusChip, type StatusTone } from '@/components/admin/status'

// Practice library — Phase 2 "Clean" quality panel (ADR-438, PRACTICE-LIBRARY §6 item 2.3).
//
// Self-fetching async RSC: reads needsAttention (public practices with a fixable gap, each scored
// by computeQualityScore) and renders a labeled fix-list ordered worst-quality first. Returns null
// when nothing needs attention, so it costs one query and renders nothing when the library is clean
// (the module contract; PAGE-FRAMEWORK §4.1). Distinct from the Phase-1 "Help gaps" rail card: this
// is the practice-quality view. Read-only; the page owns the curator gate. Built self-contained so
// the block-area agent can register it as a layout module (ADR-270/272).

const REASON: Record<AttentionReason, string> = {
  orphaned: 'No Pillar',
  imageless: 'No image',
  never_logged: 'Never logged',
  stale: 'Going stale',
}

/** Quality score → a calm tone (a low score is a nudge, never an alarm). */
function scoreTone(score: number): StatusTone {
  if (score < 40) return 'danger'
  if (score < 70) return 'warning'
  return 'neutral'
}

const PANEL_LIMIT = 12

export async function PracticeNeedsAttention() {
  const items = await needsAttention({ limit: 100 })
  if (items.length === 0) return null

  const shown = items.slice(0, PANEL_LIMIT)
  const more = items.length - shown.length

  return (
    <section className="space-y-3">
      <SectionHeader title="Needs attention" count={items.length} />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="divide-y divide-border/60">
          {shown.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/practices/${it.id}/edit`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-text hover:underline"
                >
                  <span className="min-w-0 truncate">{it.title || 'Untitled practice'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {it.reasons.map((r) => (
                    <StatusChip key={r} tone="neutral" size="sm">
                      {REASON[r]}
                    </StatusChip>
                  ))}
                </div>
              </div>
              <div
                className="flex shrink-0 flex-col items-end"
                title={`Completeness ${it.quality.completeness} · engagement ${it.quality.engagement} · freshness ${it.quality.freshness}`}
              >
                <StatusChip tone={scoreTone(it.quality.score)} size="sm">
                  Quality {it.quality.score}
                </StatusChip>
              </div>
            </div>
          ))}
        </div>
        {more > 0 && (
          <div className="border-t border-border bg-surface-elevated/40 px-4 py-2">
            <Link
              href="/admin/content/practices?status=approved&public=true&noPillar=true"
              className="text-xs font-medium text-muted transition-colors hover:text-text"
            >
              {more} more in the library. Filter by a gap to work through them.
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
