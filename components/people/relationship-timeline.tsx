import { Handshake, Heart, CalendarDays, History, type LucideIcon } from 'lucide-react'
import { getRelationshipTimeline, type TimelineKind } from '@/lib/connections/timeline'
import { relativeTime } from '@/lib/utils'

// ── Auto interaction timeline (Connection Layer P3, ADR-186) ──────────────────
// "Remembers your shared history." This is the signed-in caller's PRIVATE,
// event-derived read of their own tie to one member — when you met, when you
// became friends, every event you both turned up to. The relationship_timeline
// RPC is keyed to auth.uid(), so this is never anyone else's history but the
// viewer's own. Server component; renders nothing when there's nothing to show.

const ICON: Record<TimelineKind, LucideIcon> = {
  met: Handshake,
  connected: Heart,
  co_event: CalendarDays,
}

export async function RelationshipTimeline({
  otherId,
  title = 'Your history together',
}: {
  /** The other member's profile id. The RPC scopes the read to the signed-in caller. */
  otherId: string
  title?: string
}) {
  const items = await getRelationshipTimeline(otherId)

  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-text">
        <History className="h-4 w-4 text-primary" /> {title}
      </p>

      {items.length === 0 ? (
        <p className="text-xs text-muted">
          Your shared history will show up here as you do things together.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {items.map((item, i) => {
            const Icon = ICON[item.kind] ?? CalendarDays
            return (
              <li key={`${item.kind}-${item.at ?? i}-${i}`} className="relative">
                <span className="absolute -left-[1.4375rem] flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated ring-2 ring-surface">
                  <Icon className="h-3 w-3 text-subtle" />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-text">{item.title}</span>
                  {item.at && (
                    <time className="shrink-0 text-2xs text-subtle" dateTime={item.at}>
                      {relativeTime(item.at)}
                    </time>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
