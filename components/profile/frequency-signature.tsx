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
import { accentColor } from '@/lib/studio/accents'
import type { FrequencySignature, PillarKey } from '@/lib/frequency-signature'
import { PILLAR_KEYS } from '@/lib/frequency-signature'

// Pillar → accent key (matches components/studio/journey/journey-builder.tsx) and the
// axis position on the dial. Mind left, Body top, Spirit right, Expression bottom —
// a compass of the four Pillars.
const PILLARS: Record<PillarKey, { label: string; accent: string; angle: number }> = {
  mind: { label: 'Mind', accent: 'indigo', angle: 180 }, // left
  body: { label: 'Body', accent: 'jade', angle: -90 }, // top
  spirit: { label: 'Spirit', accent: 'plum', angle: 0 }, // right
  expression: { label: 'Expression', accent: 'gold', angle: 90 }, // bottom
}

// Axis order matched to the four cardinal points (top → right → bottom → left), so the
// polygon is drawn in a consistent winding.
const AXIS_ORDER: PillarKey[] = ['body', 'spirit', 'expression', 'mind']

/** Point on a circle of `radius` at `angleDeg`, centred at (cx, cy). */
function point(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
}

/** A smooth CLOSED path through points (closed Catmull-Rom → cubic béziers). Turns the four
 *  axis tips into one organic blob instead of a hard four-point kite, so the signature reads
 *  as a living shape that bulges toward whatever Pillar is practiced most and rounds toward a
 *  full bloom as the four even out. */
function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length
  if (n < 3) return ''
  const f = (v: number) => v.toFixed(2)
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return d + ' Z'
}

function balanceLabel(sig: FrequencySignature): string {
  if (sig.total === 0) return 'No signature yet'
  // A full, even bloom earns the strongest read — the shape has grown round and grounded.
  if (sig.fill >= 0.8 && sig.balance >= 0.85) return 'In full bloom'
  if (sig.spread === 1) return 'Focused'
  if (sig.balance >= 0.85) return 'Grounded'
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

  // 0..1 reads the shape grows from. `fill` is ABSOLUTE windowed progress (a brand-new
  // member ≈ 0 ⇒ a tiny diamond near the centre; a week-plus of broad practice ⇒ ≈ 1, a
  // full round bloom). `balanced` evens the colour + glow.
  const fill = Math.max(0, Math.min(1, signature.fill))
  const balanced = Math.max(0, Math.min(1, signature.balance))

  // Each Pillar's point reaches OUT by its own BLOOM (windowed distinct-days vs target),
  // so the shape GROWS with practice rather than only re-balancing. A small floor keeps
  // the earliest shape a visible diamond (not collapsed to a dot); bloom = 1 means that
  // Pillar has "peaked out" and its point touches the rim. Balanced + all peaked ⇒ every
  // point at the rim ⇒ the smoothed blob rounds into a full bloom filling the circle.
  const FLOOR = 0.06
  const radiusFor = (k: PillarKey) => {
    const b = Math.max(0, Math.min(1, signature.bloom[k]))
    return (FLOOR + (1 - FLOOR) * b) * maxR
  }

  const vertices = AXIS_ORDER.map((k) => point(cx, cy, radiusFor(k), PILLARS[k].angle))
  // The blob — the four axis tips smoothed into one organic shape (not a hard kite). As
  // each tip peaks toward the rim its smoothed edges bloom outward toward neighbours.
  const blob = smoothClosedPath(vertices)

  const dominant = signature.dominant ?? AXIS_ORDER[0]
  const domAccent = PILLARS[dominant].accent

  // Balance AND fill carry through COLOUR: warm brand orange while a member is lopsided or
  // just starting, easing to a grounded green only as the four EVEN OUT *and* the bloom
  // fills. Greenness = balance gated by fill (a balanced-but-tiny shape stays warm; it
  // earns green by also growing). color-mix lives in the CSS `color` property (a bare SVG
  // fill attribute can fall back to black); the blob/rings paint with currentColor.
  const greenness = balanced * (0.35 + 0.65 * fill)
  const balanceTint = `color-mix(in oklab, var(--color-success) ${Math.round(greenness * 100)}%, var(--color-primary))`

  // GLOW: a soft halo lights up BEHIND the bloom as it nears full AND balanced, brightest
  // at a grounded, full shape and fading as fill/balance drop. Omitted on the compact
  // badge (no room). Kept tasteful — the Mindless breath-visualizer calm.
  const glowStrength = fill * (0.4 + 0.6 * balanced)
  const showGlow = !compact && glowStrength > 0.04
  const glowOpacity = Math.min(0.5, 0.12 + 0.42 * glowStrength)
  const glowR = maxR * (0.7 + 0.45 * fill)
  // Filter id is keyed only on the blur radius (a pure function of the size), so the
  // <defs> is identical for any two same-size signatures — referencing it is safe even
  // if two render on one page (the duplicate definition is inert; the blur is the same).
  const filterId = `freq-glow-${Math.round(maxR)}`

  const gridLevels = compact ? [0.55, 1] : [0.36, 0.68, 1]

  const svg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={
        signature.total === 0
          ? 'Empty Frequency Signature'
          : `Frequency Signature: ${balanceLabel(signature)}, dominant ${PILLARS[dominant].label}, ${signature.spread} of 4 Pillars active, ${Math.round(fill * 100)} percent toward a full bloom`
      }
      // currentColor = the balance tint (orange → green), set as a CSS PROPERTY so the
      // color-mix()/var() always resolves — a bare SVG fill ATTRIBUTE can fall back to solid
      // black. Soft, luminous, no backdrop — the Mindless breath-visualizer vibe.
      style={{ color: balanceTint }}
      className={compact ? '' : stacked ? 'h-full w-full' : 'mx-auto'}
    >
      {/* Glow halo behind the bloom — a blurred disc in the balance tint that brightens
          as the shape fills and grounds. Rendered first so it sits BEHIND everything. */}
      {showGlow && (
        <>
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={maxR * 0.22} />
            </filter>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={glowR.toFixed(2)}
            fill="currentColor"
            opacity={glowOpacity}
            filter={`url(#${filterId})`}
            className="freq-glow"
          />
        </>
      )}

      {/* Concentric rings — soft + luminous, no fill (breath-visualizer ripple). */}
      {gridLevels.map((lvl, i) => (
        <circle
          key={lvl}
          cx={cx}
          cy={cy}
          r={(maxR * lvl).toFixed(2)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.12 + i * 0.06}
        />
      ))}

      {/* Spokes to each axis tip (faint). */}
      {!compact &&
        AXIS_ORDER.map((k) => {
          const [x, y] = point(cx, cy, maxR, PILLARS[k].angle)
          return (
            <line key={k} x1={cx} y1={cy} x2={x.toFixed(2)} y2={y.toFixed(2)} stroke="currentColor" strokeWidth={1} opacity={0.12} />
          )
        })}

      {/* The blob — the signature itself. Fill + stroke in the balance tint (currentColor):
          warm when leaning on one Pillar, green as the four come into balance. */}
      <path
        d={blob}
        fill="currentColor"
        // Fuller blooms read a touch more solid/luminous, so growth is felt, not just seen.
        fillOpacity={(compact ? 0.24 : 0.18) + 0.16 * fill}
        stroke="currentColor"
        strokeWidth={compact ? 1.5 : 2}
        strokeLinejoin="round"
      />

      {/* Per-axis nodes — each in its own Pillar accent (inline style → the var resolves). */}
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
            style={{ fill: accentColor(PILLARS[k].accent) }}
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
          <AxisLabel pillar="mind" pos="left" dominant={dominant} />
          <AxisLabel pillar="body" pos="top" dominant={dominant} />
          <AxisLabel pillar="spirit" pos="right" dominant={dominant} />
          <AxisLabel pillar="expression" pos="bottom" dominant={dominant} />
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

          {/* Bloom meter — the ABSOLUTE growth read: how full the shape is right now.
              Recent practice across all four Pillars grows it toward a full bloom; a
              quiet stretch lets it ease back. Painted in the balance tint (currentColor). */}
          <div className="mt-3" style={{ color: balanceTint }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-text">Bloom</span>
              <span className="text-2xs font-medium tabular-nums text-subtle">
                {Math.round(fill * 100)}% to full
              </span>
            </div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <span
                className="block h-full rounded-full bg-current"
                style={{ width: `${Math.max(2, Math.round(fill * 100))}%` }}
              />
            </span>
          </div>

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
