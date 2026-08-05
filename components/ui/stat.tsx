import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Stat (DAWN core/Stat) — a big display numeral over an uppercase label. The
// EDITORIAL way Frequency shows a count: splash proof strips, a Space's public
// page, a season recap. Group three in a row for a stat strip.
//
// ── Three number primitives, three jobs. Pick by WHO is reading and WHY: ──────────
//   Stat       (this file)              — a VISITOR, being shown scale. Display face,
//                                         --text-stat, uppercase caption. No trend, no
//                                         icon, no link. It is a headline that happens
//                                         to be a number.
//   Counter    (components/ui/counter)  — a MEMBER, reading their own game state (Zaps,
//                                         Gems, streak, room counts). Small, mono,
//                                         tabular, inline. A reading, not a headline.
//   StatCard   (components/ui/stat-card)— an OPERATOR, watching momentum. A tile with a
//                                         delta, a trend arrow, a sparkline, a drill-down
//                                         href. DAWN §6: analytics deltas never appear on
//                                         a member surface, so StatCard is operator-only
//                                         and Stat is deliberately trendless.
// StatCard's 98 importers do NOT cover this case: its value tops out at `text-lead` inside
// a bordered/soft tile, which is the opposite of an editorial numeral on an open band.
//
// TYPE. The numeral takes the `text-stat` ROLE (--text-stat: clamp(3.5rem,6vw,4.5rem),
// scaled by --type-scale), not a literal 6xl/7xl display step. That is the whole reason
// this primitive belongs in the kit: the literal-display-type ratchet counts 301 hand-sized
// display numerals, and every one of them is a size that stops responding when a member
// turns the type scale up.
//
// NOTE for the Phase 3 sweep: `components/marketing/marketing-ui.tsx` exports a near-twin
// `Stat` (1 importer, `app/page.tsx`) pinned to a literal 6xl/7xl pair. This is the canonical
// primitive; that one is the duplicate to re-point at this file. Still not done — both files
// were owned by another agent in the 2026-08-05 sweep.
//
// The sweep DID convert the other twin, `LiveStatsBlock` in components/marketing/blocks.tsx,
// which carried byte-identical markup. That proves the re-point out: the two components are
// prop-compatible for every existing call site, and the only render deltas are
//   1. `text-6xl sm:text-7xl` (3.75/4.5rem, fixed) → `text-stat` (clamp(3.5,6vw,4.5rem),
//      multiplied by --type-scale) — the whole point, and the reason this primitive exists;
//   2. `tabular-nums` + `leading-none` are added to the numeral;
//   3. the label class set is otherwise identical, reordered only.
// The marketing twin's props are NARROWER (`value: number | string`, `label: string`, no
// `className`), so every marketing-ui caller already type-checks against this file's
// `ReactNode` signature. Deleting the marketing-ui export and re-exporting this one is a
// safe, mechanical swap; see the sweep report for the exact recipe.
//
// Presentational + server-friendly (no hooks, no client boundary).
//
//   <div className="grid grid-cols-3 gap-6">
//     <Stat value={24} label="Circles near you" />
//     <Stat value="1.2k" label="Practices this week" />
//     <Stat value={38} label="Events" />
//   </div>

/** `ink` for use inside a dark band (`bg-ink`), where the label needs the on-ink pair. */
export type StatTone = 'light' | 'ink'

const TONE: Record<StatTone, { value: string; label: string }> = {
  light: { value: 'text-text', label: 'text-subtle' },
  ink: { value: 'text-on-ink', label: 'text-on-ink-subtle' },
}

export type StatProps = {
  /** The number or short string (24, "1.2k", "3 min"). Honour the social-proof floor:
   *  below ~25 members show founding framing rather than a literal "0" (DAWN Stat). */
  value: ReactNode
  /** The caption under the value. Rendered uppercase by the primitive — pass it in
   *  sentence case so the string stays readable to screen readers and to the next author. */
  label: ReactNode
  tone?: StatTone
  className?: string
}

export function Stat({ value, label, tone = 'light', className }: StatProps) {
  const t = TONE[tone]
  return (
    <div className={className}>
      {/* `tabular-nums` per the counter law: a stat strip is a row of numerals that must
          not shuffle sideways between renders. The display face carries the drama; the
          figures still line up. */}
      <p className={cn('font-display text-stat tabular-nums leading-none', t.value)}>{value}</p>
      {/* The one uppercase caption DAWN allows on a numeral. It is a CAPTION on a display
          figure, not an all-caps micro-label section header (the §6 "never"). */}
      <p className={cn('mt-3 text-meta font-bold uppercase tracking-eyebrow', t.label)}>{label}</p>
    </div>
  )
}
