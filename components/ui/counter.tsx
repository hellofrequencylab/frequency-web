import type { LucideIcon } from 'lucide-react'

// Counter — the ONE way a member sees a plain number (DAWN 2026-08-03 §5). The
// four game counts (Zaps, Gems, streak, freezes) plus room/board counts (posts,
// replies, rooms) render through this: a small mono numeral with a quiet label.
// No deltas, no trends, no oversized numerals — momentum belongs to StatCard;
// this is a reading, not a dashboard tile.
//
// Presentational + server-friendly (no hooks). Compose several with CounterRow.
//
//   <Counter value={12} label="day streak" glyph={Flame} tone="primary-strong" />
//   <CounterRow>
//     <Counter value={340} label="Zaps" />
//     <Counter value={85} label="Gems" glyph={Gem} tone="signal" />
//   </CounterRow>

/** Glyph tone, by the KIND of thing being counted (DAWN's counter tone law: Zaps and
 *  streaks amber, Gems and trophies teal, Airtime and movement the Move blue). The
 *  names are ProgressTrack's tone vocabulary, deliberately — one tone language across
 *  the kit, so a Gem is `signal` on a bar and on a counter alike. `neutral` (the
 *  default) is the quiet subtle glyph the first call sites shipped with. */
export type CounterTone =
  | 'neutral'
  | 'primary'
  | 'primary-strong'
  | 'signal'
  | 'move'
  | 'success'
  | 'warning'
  | 'danger'

const TONE: Record<CounterTone, string> = {
  neutral: 'text-subtle',
  primary: 'text-primary',
  'primary-strong': 'text-primary-strong',
  signal: 'text-signal',
  move: 'text-move',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

export function Counter({
  value,
  label,
  glyph: Glyph,
  tone = 'neutral',
  labelHidden = false,
  layout = 'inline',
}: {
  value: number
  label: string
  /** Optional lucide glyph (e.g. Flame, MessageSquare for posts/replies/rooms). */
  glyph?: LucideIcon
  /** Which KIND this is, which decides the glyph's colour. Never the numeral's. */
  tone?: CounterTone
  /** Keep the label for assistive tech but drop it visually — for a run of counters
   *  in a strip too tight for the words, where the glyph carries the kind (the Vault
   *  dock head). The reading is still announced, and the `title` still spells it out. */
  labelHidden?: boolean
  /** `inline` (default) reads as a sentence fragment; `stacked` centres the numeral
   *  over its label for a tile in a scoreboard grid. */
  layout?: 'inline' | 'stacked'
}) {
  const reading = value.toLocaleString()
  // A ZERO IS MUTED, NEVER RED (DAWN's counter law). Zero is a real answer — the day you
  // have not earned a Zap yet is not an error state — so it recedes rather than alarms.
  const numeral = value === 0 ? 'text-muted' : 'text-text'
  const labelCls = `text-2xs font-medium text-muted${labelHidden ? ' sr-only' : ''}`

  if (layout === 'stacked') {
    return (
      <span className="flex flex-col items-center gap-0.5" title={`${reading} ${label}`}>
        <span className="flex items-center justify-center gap-1">
          {Glyph && <Glyph className={`h-3.5 w-3.5 shrink-0 ${TONE[tone]}`} aria-hidden />}
          <span className={`font-mono text-body font-bold tabular-nums leading-none ${numeral}`}>
            {reading}
          </span>
        </span>
        <span className={labelCls}>{label}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-baseline gap-1.5" title={`${reading} ${label}`}>
      {Glyph && <Glyph className={`h-3.5 w-3.5 shrink-0 self-center ${TONE[tone]}`} aria-hidden />}
      <span className={`font-mono text-body-sm font-semibold tabular-nums leading-none ${numeral}`}>
        {reading}
      </span>
      <span className={labelCls}>{label}</span>
    </span>
  )
}

/** Lays out multiple Counters inline (the season strip, a room's three counts). */
export function CounterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">{children}</div>
}
