// The Frequency Signature — a member's evolving visual identity rendered as a
// four-axis "constellation" (a radar / kite over the four Pillars). See
// docs/JOURNEYS.md §9.2. Presentational Server Component: it takes a computed
// FrequencySignature (from lib/frequency-signature-data.ts) and draws it. No data
// fetching, no state.
//
// Colour discipline (DAWN): every colour is a semantic CSS-variable token. Pillar
// accents resolve to `var(--color-rank-*)` via lib/studio/accents — the same
// pillar→accent convention the Journey builder uses ({ mind: indigo, body: jade,
// spirit: plum, expression: gold }). NO hardcoded hex anywhere.

import { Compass } from 'lucide-react'
import { accentColor, accentTint } from '@/lib/studio/accents'
import type { FrequencySignature, PillarKey } from '@/lib/frequency-signature'
import { PILLAR_KEYS } from '@/lib/frequency-signature'

// Pillar → accent key (matches components/studio/journey/journey-builder.tsx) and the
// axis position on the constellation. Mind top, Body right, Spirit bottom,
// Expression left — a compass of the four Pillars.
const PILLARS: Record<PillarKey, { label: string; accent: string; angle: number }> = {
  mind: { label: 'Mind', accent: 'indigo', angle: -90 }, // top
  body: { label: 'Body', accent: 'jade', angle: 0 }, // right
  spirit: { label: 'Spirit', accent: 'plum', angle: 90 }, // bottom
  expression: { label: 'Expression', accent: 'gold', angle: 180 }, // left
}

// Axis order matched to the four cardinal points (top → right → bottom → left), so the
// polygon is drawn in a consistent winding.
const AXIS_ORDER: PillarKey[] = ['mind', 'body', 'spirit', 'expression']

/** Point on a circle of `radius` at `angleDeg`, centred at (cx, cy). */
function point(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
}

function balanceLabel(sig: FrequencySignature): string {
  if (sig.total === 0) return 'No signature yet'
  if (sig.spread === 1) return 'Focused'
  if (sig.balance >= 0.85) return 'In balance'
  if (sig.balance >= 0.6) return 'Finding balance'
  return 'Leaning in'
}

interface Props {
  signature: FrequencySignature
  /** `full` = profile centerpiece (labelled, with legend). `compact` = a small
   *  inline badge (the shape only, for a card or row). */
  variant?: 'full' | 'compact'
  /** `auto` (default) lays the full variant out side-by-side on sm+. `stack` keeps
   *  the constellation above the legend at every width and shrinks the radar a
   *  touch — for a narrow column (the profile's interior sidebar). */
  layout?: 'auto' | 'stack'
  /** Whose signature this is — tunes the empty-state copy ('you' vs a name). */
  name?: string
  className?: string
}

export function FrequencySignature({ signature, variant = 'full', layout = 'auto', name, className }: Props) {
  const compact = variant === 'compact'
  const stacked = layout === 'stack'

  // Empty state — no shape yet. Keep it warm and inviting, not a dead box.
  if (signature.total === 0) {
    if (compact) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-2xs font-medium text-subtle ${className ?? ''}`}
          title="No Frequency Signature yet. Log practices across the Pillars to form one"
        >
          <Compass className="h-3 w-3" /> No signature yet
        </span>
      )
    }
    return (
      <div
        className={`rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center ${className ?? ''}`}
      >
        <Compass className="mx-auto mb-3 h-8 w-8 text-subtle" />
        <p className="text-sm font-semibold text-text">No Frequency Signature yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {name ? `${name} hasn't` : 'You haven’t'} logged any practice yet. A signature takes
          shape across the four Pillars (Mind, Body, Spirit, and Expression) as the practice
          spreads.
        </p>
      </div>
    )
  }

  // Geometry. A square viewBox; the constellation lives inside an inset so axis
  // labels have room (full variant).
  const size = compact ? 56 : stacked ? 210 : 240
  const cx = size / 2
  const cy = size / 2
  const pad = compact ? 6 : stacked ? 40 : 46
  const maxR = cx - pad

  // Each axis is scaled by signature.axes[pillar] (0..1 of the peak pillar). A small
  // floor keeps a barely-touched pillar visible (so the shape never collapses to a
  // line), and an untouched pillar sits at the centre.
  const radiusFor = (k: PillarKey) => {
    const a = signature.axes[k]
    if (a <= 0) return 0
    return (0.12 + 0.88 * a) * maxR
  }

  const vertices = AXIS_ORDER.map((k) => point(cx, cy, radiusFor(k), PILLARS[k].angle))
  const polygon = vertices.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

  // The dominant pillar tints the fill + sets the emphasised accent.
  const dominant = signature.dominant ?? AXIS_ORDER[0]
  const domAccent = PILLARS[dominant].accent
  const fill = accentTint(domAccent, compact ? 18 : 16)
  const stroke = accentColor(domAccent)

  const gridLevels = compact ? [1] : [0.34, 0.67, 1]

  const svg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={
        signature.total === 0
          ? 'Empty Frequency Signature'
          : `Frequency Signature: dominant ${PILLARS[dominant].label}, ${signature.spread} of 4 Pillars active`
      }
      className={compact ? '' : stacked ? 'h-full w-full' : 'mx-auto'}
    >
      {/* Concentric grid rings — neutral border token so they read as structure. */}
      {gridLevels.map((lvl) => (
        <polygon
          key={lvl}
          points={AXIS_ORDER.map((k) => {
            const [x, y] = point(cx, cy, maxR * lvl, PILLARS[k].angle)
            return `${x.toFixed(2)},${y.toFixed(2)}`
          }).join(' ')}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1}
          opacity={compact ? 0.6 : 0.7}
        />
      ))}

      {/* Spokes to each axis tip. */}
      {!compact &&
        AXIS_ORDER.map((k) => {
          const [x, y] = point(cx, cy, maxR, PILLARS[k].angle)
          return (
            <line
              key={k}
              x1={cx}
              y1={cy}
              x2={x.toFixed(2)}
              y2={y.toFixed(2)}
              stroke="var(--color-border)"
              strokeWidth={1}
              opacity={0.5}
            />
          )
        })}

      {/* The signature shape. */}
      <polygon
        points={polygon}
        fill={fill}
        stroke={stroke}
        strokeWidth={compact ? 1.5 : 2}
        strokeLinejoin="round"
      />

      {/* Per-axis nodes — each in its own Pillar accent, the dominant one larger. */}
      {AXIS_ORDER.map((k, i) => {
        if (signature.axes[k] <= 0) return null
        const [x, y] = vertices[i]
        const isDom = k === dominant
        return (
          <circle
            key={k}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r={isDom ? (compact ? 2.4 : 4.5) : compact ? 1.6 : 3}
            fill={accentColor(PILLARS[k].accent)}
          />
        )
      })}
    </svg>
  )

  if (compact) {
    return (
      <span className={`inline-flex items-center justify-center ${className ?? ''}`} title={`Frequency Signature · ${balanceLabel(signature)} · ${PILLARS[dominant].label}-led`}>
        {svg}
      </span>
    )
  }

  // Full: the constellation with corner Pillar labels overlaid, plus a legend that
  // reads the balance + dominant pillar and the per-pillar shares.
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-sm ${className ?? ''}`}>
      <div className={`flex flex-col items-center gap-5 ${stacked ? '' : 'sm:flex-row sm:items-center sm:gap-6'}`}>
        {/* The constellation, with axis labels positioned at the four cardinals.
            Stacked (narrow sidebar): a responsive square that shrinks to fit. */}
        <div
          className={stacked ? 'relative mx-auto aspect-square w-full max-w-[210px]' : 'relative shrink-0'}
          style={stacked ? undefined : { width: size, height: size }}
        >
          {svg}
          <AxisLabel pillar="mind" pos="top" dominant={dominant} />
          <AxisLabel pillar="body" pos="right" dominant={dominant} />
          <AxisLabel pillar="spirit" pos="bottom" dominant={dominant} />
          <AxisLabel pillar="expression" pos="left" dominant={dominant} />
        </div>

        {/* Legend — balance read + per-pillar bars. */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-base font-bold text-text">{balanceLabel(signature)}</p>
            <span className="text-xs font-medium text-subtle">
              {signature.spread} of 4 Pillars
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-semibold" style={{ color: accentColor(domAccent) }}>
              {PILLARS[dominant].label}
            </span>
            -led signature, drawn from {signature.total} {signature.total === 1 ? 'practice' : 'practices'} logged.
          </p>

          <ul className="mt-3 space-y-1.5">
            {PILLAR_KEYS.map((k) => {
              const share = signature.shares[k]
              const pct = Math.round(share * 100)
              const acc = accentColor(PILLARS[k].accent)
              return (
                <li key={k} className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: acc }} />
                  <span className="w-20 shrink-0 text-xs font-medium text-text">{PILLARS[k].label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: acc }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-2xs tabular-nums text-subtle">
                    {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

// A Pillar's name pinned to its cardinal edge of the constellation. The dominant
// Pillar reads stronger (its accent + bolder weight).
function AxisLabel({
  pillar,
  pos,
  dominant,
}: {
  pillar: PillarKey
  pos: 'top' | 'right' | 'bottom' | 'left'
  dominant: PillarKey
}) {
  const isDom = pillar === dominant
  const place =
    pos === 'top'
      ? 'left-1/2 top-0 -translate-x-1/2'
      : pos === 'bottom'
        ? 'left-1/2 bottom-0 -translate-x-1/2'
        : pos === 'left'
          ? 'left-0 top-1/2 -translate-y-1/2'
          : 'right-0 top-1/2 -translate-y-1/2'
  return (
    <span
      className={`pointer-events-none absolute text-2xs font-semibold tracking-tight ${place} ${
        isDom ? '' : 'text-subtle'
      }`}
      style={isDom ? { color: accentColor(PILLARS[pillar].accent) } : undefined}
    >
      {PILLARS[pillar].label}
    </span>
  )
}
