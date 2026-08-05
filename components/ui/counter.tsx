import type { LucideIcon } from 'lucide-react'

// Counter — the ONE way a member sees a plain number (DAWN 2026-08-03 §5). The
// four game counts (Zaps, Gems, streak, freezes) plus room/board counts (posts,
// replies, rooms) render through this: a small mono numeral with a quiet label.
// No deltas, no trends, no oversized numerals — momentum belongs to StatCard;
// this is a reading, not a dashboard tile.
//
// Presentational + server-friendly (no hooks). Compose several with CounterRow.
//
//   <Counter value={12} label="day streak" glyph={Flame} />
//   <CounterRow>
//     <Counter value={340} label="Zaps" />
//     <Counter value={85} label="Gems" />
//   </CounterRow>

export function Counter({
  value,
  label,
  glyph: Glyph,
}: {
  value: number
  label: string
  /** Optional lucide glyph (e.g. Flame, MessageSquare for posts/replies/rooms). */
  glyph?: LucideIcon
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={`${value.toLocaleString()} ${label}`}>
      {Glyph && <Glyph className="h-3.5 w-3.5 shrink-0 self-center text-subtle" aria-hidden />}
      <span className="font-mono text-body-sm font-semibold tabular-nums leading-none text-text">
        {value.toLocaleString()}
      </span>
      <span className="text-2xs font-medium text-muted">{label}</span>
    </span>
  )
}

/** Lays out multiple Counters inline (the season strip, a room's three counts). */
export function CounterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">{children}</div>
}
