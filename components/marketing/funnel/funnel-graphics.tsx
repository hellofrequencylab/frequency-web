// OPERATOR FUNNEL DOORS — the inline SVG graphic set (ADR-591). Flat, geometric, calm, drawn entirely in
// the house design tokens: every shape uses `currentColor` and a semantic `text-*` class (never a hardcoded
// hex), so light/dark + brand accent all flow through. In each graphic ONE element is "the active one" and
// carries the accent (text-primary-strong); everything else stays quiet (border / muted / subtle). All are
// responsive (width=100%, height=auto via viewBox + preserveAspectRatio); decorative ones are aria-hidden,
// and the signature Loop is labelled with <title>/<desc>. No motion here; the page respects reduced-motion.

import type { FunnelIconName } from '@/lib/marketing/funnel-config'

// A shared, calm rounded-rect "card" helper keeps the geometry consistent across graphics.
const CARD_RADIUS = 10

// ── HeroProductGraphic — two overlapping product cards: a week schedule with one slot "booked + paid"
//    (the active state) and a client contact card with a small QR glyph. ──────────────────────────────
export function HeroProductGraphic({ className = '' }: { className?: string }) {
  const days = ['M', 'T', 'W', 'T', 'F']
  return (
    <svg viewBox="0 0 420 320" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* Soft ground shadow */}
      <ellipse cx="215" cy="298" rx="150" ry="12" className="text-border" fill="currentColor" opacity="0.35" />

      {/* Schedule card (back) */}
      <g className="text-surface">
        <rect x="34" y="40" width="248" height="216" rx="16" fill="currentColor" className="text-surface" />
        <rect x="34" y="40" width="248" height="216" rx="16" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.5" />
      </g>
      <g className="text-subtle">
        <rect x="54" y="60" width="92" height="10" rx="5" fill="currentColor" opacity="0.55" />
      </g>
      {/* Day columns */}
      {days.map((d, i) => (
        <g key={i}>
          <text x={70 + i * 44} y="98" textAnchor="middle" className="text-subtle" fill="currentColor" fontSize="12" fontWeight="600">{d}</text>
          {[0, 1, 2].map((r) => {
            const active = i === 2 && r === 1 // the one booked + paid slot
            return (
              <rect
                key={r}
                x={52 + i * 44}
                y={112 + r * 40}
                width="36"
                height="30"
                rx="7"
                fill="currentColor"
                className={active ? 'text-primary-strong' : 'text-border'}
                opacity={active ? 1 : 0.4}
              />
            )
          })}
        </g>
      ))}
      {/* "Paid" tick on the active slot */}
      <g className="text-on-primary">
        <path d="M143 152 l6 6 l11 -12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Contact card (front, overlapping) */}
      <g>
        <rect x="196" y="150" width="196" height="120" rx="16" fill="currentColor" className="text-surface-elevated" />
        <rect x="196" y="150" width="196" height="120" rx="16" fill="none" stroke="currentColor" className="text-border-strong" strokeWidth="1.5" />
        {/* avatar */}
        <circle cx="228" cy="186" r="18" fill="currentColor" className="text-primary-bg" />
        <circle cx="228" cy="180" r="6.5" fill="currentColor" className="text-primary-strong" />
        <path d="M215 199 a13 10 0 0 1 26 0" fill="currentColor" className="text-primary-strong" />
        {/* name + context lines */}
        <rect x="256" y="176" width="86" height="9" rx="4.5" fill="currentColor" className="text-text" opacity="0.85" />
        <rect x="256" y="192" width="112" height="7" rx="3.5" fill="currentColor" className="text-subtle" opacity="0.6" />
        {/* QR glyph corner */}
        <g className="text-muted" transform="translate(344,222)">
          <rect x="0" y="0" width="30" height="30" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="6" y="6" width="7" height="7" fill="currentColor" />
          <rect x="17" y="6" width="7" height="7" fill="currentColor" />
          <rect x="6" y="17" width="7" height="7" fill="currentColor" />
          <rect x="18" y="18" width="5" height="5" fill="currentColor" />
        </g>
      </g>
    </svg>
  )
}

// ── ScatteredStackGraphic — the "before": six faded, tilted tool cards converging via arrows into one
//    crisp active "Your Space" card. ──────────────────────────────────────────────────────────────────
export function ScatteredStackGraphic({ className = '' }: { className?: string }) {
  // Six little tool glyphs, tilted + faded, on the left.
  const tools: { x: number; y: number; rot: number; glyph: React.ReactNode }[] = [
    { x: 20, y: 40, rot: -8, glyph: <rect x="10" y="12" width="34" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /> }, // calendar
    { x: 96, y: 22, rot: 6, glyph: <><line x1="10" y1="16" x2="44" y2="16" stroke="currentColor" strokeWidth="1.5" /><line x1="10" y1="26" x2="44" y2="26" stroke="currentColor" strokeWidth="1.5" /><line x1="22" y1="12" x2="22" y2="40" stroke="currentColor" strokeWidth="1.5" /></> }, // spreadsheet
    { x: 26, y: 118, rot: 5, glyph: <><rect x="10" y="14" width="34" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="10" y1="22" x2="44" y2="22" stroke="currentColor" strokeWidth="1.5" /></> }, // card/payment
    { x: 104, y: 130, rot: -6, glyph: <><rect x="12" y="10" width="28" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="18" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="1.5" /><line x1="18" y1="28" x2="34" y2="28" stroke="currentColor" strokeWidth="1.5" /></> }, // notepad
    { x: 30, y: 196, rot: -5, glyph: <><rect x="10" y="14" width="34" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 16 L27 30 L44 16" fill="none" stroke="currentColor" strokeWidth="1.5" /></> }, // envelope
    { x: 106, y: 210, rot: 7, glyph: <rect x="14" y="12" width="26" height="28" rx="2" fill="currentColor" opacity="0.5" /> }, // sticky note
  ]
  return (
    <svg viewBox="0 0 480 280" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {tools.map((t, i) => (
        <g key={i} transform={`translate(${t.x},${t.y}) rotate(${t.rot} 27 26)`} className="text-subtle" opacity="0.5">
          <rect x="2" y="4" width="50" height="46" rx={CARD_RADIUS} fill="currentColor" className="text-surface" opacity="0.9" />
          <rect x="2" y="4" width="50" height="46" rx={CARD_RADIUS} fill="none" stroke="currentColor" strokeWidth="1.25" />
          {t.glyph}
        </g>
      ))}

      {/* converging arrows */}
      <g className="text-border-strong" opacity="0.7">
        {[70, 140, 210].map((y, i) => (
          <path key={i} d={`M170 ${y} C 230 ${y}, 250 140, 300 140`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" />
        ))}
        <path d="M296 140 l-9 -5 l0 10 z" fill="currentColor" />
      </g>

      {/* the one crisp active Space card */}
      <g>
        <rect x="312" y="86" width="150" height="108" rx="16" fill="currentColor" className="text-surface-elevated" />
        <rect x="312" y="86" width="150" height="108" rx="16" fill="none" stroke="currentColor" className="text-primary-strong" strokeWidth="2" />
        <rect x="330" y="104" width="60" height="10" rx="5" fill="currentColor" className="text-primary-strong" />
        <rect x="330" y="124" width="114" height="7" rx="3.5" fill="currentColor" className="text-subtle" opacity="0.6" />
        <rect x="330" y="138" width="96" height="7" rx="3.5" fill="currentColor" className="text-subtle" opacity="0.6" />
        <rect x="330" y="162" width="72" height="18" rx="9" fill="currentColor" className="text-primary" />
        <text x="387" y="230" textAnchor="middle" className="text-text" fill="currentColor" fontSize="13" fontWeight="700">Your Space</text>
      </g>
    </svg>
  )
}

// ── SetupStepsGraphic — three UI frames on a threaded connector: profile, contacts w/ QR badge, calendar
//    with one active slot. Numbered markers above. ─────────────────────────────────────────────────────
export function SetupStepsGraphic({ className = '' }: { className?: string }) {
  const frames = [0, 1, 2]
  const fx = (i: number) => 34 + i * 150
  return (
    <svg viewBox="0 0 480 220" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* connecting thread */}
      <g className="text-border-strong">
        <line x1="80" y1="46" x2="400" y2="46" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
      </g>
      {frames.map((i) => (
        <g key={i}>
          {/* node + number */}
          <circle cx={fx(i) + 56} cy="46" r="15" fill="currentColor" className={i === 2 ? 'text-primary-strong' : 'text-surface-elevated'} />
          <circle cx={fx(i) + 56} cy="46" r="15" fill="none" stroke="currentColor" className={i === 2 ? 'text-primary-strong' : 'text-border-strong'} strokeWidth="1.5" />
          <text x={fx(i) + 56} y="51" textAnchor="middle" fill="currentColor" className={i === 2 ? 'text-on-primary' : 'text-muted'} fontSize="14" fontWeight="700">{i + 1}</text>

          {/* frame */}
          <rect x={fx(i)} y="76" width="112" height="120" rx="14" fill="currentColor" className="text-surface" />
          <rect x={fx(i)} y="76" width="112" height="120" rx="14" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.5" />
        </g>
      ))}

      {/* Frame 1: profile page */}
      <g transform={`translate(${fx(0)},76)`}>
        <circle cx="56" cy="34" r="16" fill="currentColor" className="text-primary-bg" />
        <circle cx="56" cy="29" r="6" fill="currentColor" className="text-primary-strong" />
        <path d="M44 46 a12 9 0 0 1 24 0" fill="currentColor" className="text-primary-strong" />
        <rect x="30" y="62" width="52" height="8" rx="4" fill="currentColor" className="text-text" opacity="0.8" />
        <rect x="22" y="80" width="68" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.55" />
        <rect x="22" y="92" width="54" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.55" />
      </g>

      {/* Frame 2: contacts list + QR badge */}
      <g transform={`translate(${fx(1)},76)`}>
        {[0, 1, 2].map((r) => (
          <g key={r}>
            <circle cx="26" cy={30 + r * 26} r="8" fill="currentColor" className="text-primary-bg" />
            <rect x="40" y={26 + r * 26} width="46" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.6" />
          </g>
        ))}
        <g transform="translate(74,86)" className="text-primary-strong">
          <rect x="0" y="0" width="24" height="24" rx="4" fill="currentColor" className="text-primary" />
          <rect x="5" y="5" width="5" height="5" fill="currentColor" className="text-on-primary" />
          <rect x="14" y="5" width="5" height="5" fill="currentColor" className="text-on-primary" />
          <rect x="5" y="14" width="5" height="5" fill="currentColor" className="text-on-primary" />
        </g>
      </g>

      {/* Frame 3: calendar with one active slot */}
      <g transform={`translate(${fx(2)},76)`}>
        <rect x="18" y="20" width="76" height="10" rx="5" fill="currentColor" className="text-subtle" opacity="0.5" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const active = r === 1 && c === 1
            return (
              <rect key={`${r}-${c}`} x={20 + c * 26} y={40 + r * 24} width="20" height="18" rx="4" fill="currentColor" className={active ? 'text-primary-strong' : 'text-border'} opacity={active ? 1 : 0.45} />
            )
          }),
        )}
      </g>
    </svg>
  )
}

// ── SetupStepGraphic — ONE enlarged UI frame from the setup flow (profile · contacts+QR · calendar),
//    for the "One place" section where each step stands on its own with its copy beneath. Same inner art
//    as SetupStepsGraphic, drawn larger. step: 0 profile · 1 contacts · 2 calendar (the active frame). ──
export function SetupStepGraphic({ step, className = '' }: { step: 0 | 1 | 2; className?: string }) {
  return (
    <svg viewBox="0 0 140 148" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* frame */}
      <rect x="14" y="14" width="112" height="120" rx="14" fill="currentColor" className="text-surface" />
      <rect x="14" y="14" width="112" height="120" rx="14" fill="none" stroke="currentColor" className={step === 2 ? 'text-primary-strong' : 'text-border'} strokeWidth="1.5" />
      <g transform="translate(14,14)">
        {step === 0 && (
          // profile page
          <g>
            <circle cx="56" cy="34" r="16" fill="currentColor" className="text-primary-bg" />
            <circle cx="56" cy="29" r="6" fill="currentColor" className="text-primary-strong" />
            <path d="M44 46 a12 9 0 0 1 24 0" fill="currentColor" className="text-primary-strong" />
            <rect x="30" y="62" width="52" height="8" rx="4" fill="currentColor" className="text-text" opacity="0.8" />
            <rect x="22" y="80" width="68" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.55" />
            <rect x="22" y="92" width="54" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.55" />
          </g>
        )}
        {step === 1 && (
          // contacts list + QR badge
          <g>
            {[0, 1, 2].map((r) => (
              <g key={r}>
                <circle cx="26" cy={30 + r * 26} r="8" fill="currentColor" className="text-primary-bg" />
                <rect x="40" y={26 + r * 26} width="46" height="6" rx="3" fill="currentColor" className="text-subtle" opacity="0.6" />
              </g>
            ))}
            <g transform="translate(74,86)">
              <rect x="0" y="0" width="24" height="24" rx="4" fill="currentColor" className="text-primary" />
              <rect x="5" y="5" width="5" height="5" fill="currentColor" className="text-on-primary" />
              <rect x="14" y="5" width="5" height="5" fill="currentColor" className="text-on-primary" />
              <rect x="5" y="14" width="5" height="5" fill="currentColor" className="text-on-primary" />
            </g>
          </g>
        )}
        {step === 2 && (
          // calendar with one active slot
          <g>
            <rect x="18" y="20" width="76" height="10" rx="5" fill="currentColor" className="text-subtle" opacity="0.5" />
            {[0, 1, 2].map((r) =>
              [0, 1, 2].map((c) => {
                const active = r === 1 && c === 1
                return (
                  <rect key={`${r}-${c}`} x={20 + c * 26} y={40 + r * 24} width="20" height="18" rx="4" fill="currentColor" className={active ? 'text-primary-strong' : 'text-border'} opacity={active ? 1 : 0.45} />
                )
              }),
            )}
          </g>
        )}
      </g>
    </svg>
  )
}

// ── LoopGraphic — THE signature. Six nodes in a ring with clockwise directional arrows: Meet -> Scan ->
//    Contacts -> Invite -> Join -> Return -> Meet. Frequency mark at center. Labelled for a11y. ─────────
const LOOP_NODES = ['Meet', 'Scan', 'Save', 'Invite', 'Join', 'Return'] as const
export function LoopGraphic({ className = '' }: { className?: string }) {
  const cx = 210
  const cy = 200
  const R = 138
  const nodeR = 40
  // Six positions, starting at top and going clockwise.
  const pts = LOOP_NODES.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }
  })
  // Arc arrows between consecutive nodes (clockwise), stopping short of the node circles.
  const arc = (i: number) => {
    const p0 = pts[i]
    const p1 = pts[(i + 1) % 6]
    // trim endpoints toward each other by the node radius along the chord
    const trim = nodeR + 8
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    const sx = p0.x + ux * trim
    const sy = p0.y + uy * trim
    const ex = p1.x - ux * trim
    const ey = p1.y - uy * trim
    // bow the path outward along the ring for a pleasing curve
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    const outx = mx + (mx - cx) * 0.16
    const outy = my + (my - cy) * 0.16
    return { d: `M${sx.toFixed(1)} ${sy.toFixed(1)} Q ${outx.toFixed(1)} ${outy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, ex, ey, ux, uy }
  }

  return (
    <svg viewBox="0 -16 420 432" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="loopTitle loopDesc">
      <title id="loopTitle">The Frequency referral loop</title>
      <desc id="loopDesc">
        A ring of six steps flowing clockwise: Meet someone, Scan a code, save them to Contacts, Invite them,
        they Join Frequency, and they Return, which begins the loop again.
      </desc>

      {/* arrows */}
      {LOOP_NODES.map((_, i) => {
        const a = arc(i)
        const ang = Math.atan2(a.uy, a.ux)
        return (
          <g key={`a${i}`} className="text-primary-strong">
            <path d={a.d} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" opacity="0.9" />
            {/* arrowhead */}
            <g transform={`translate(${a.ex.toFixed(1)},${a.ey.toFixed(1)}) rotate(${(ang * 180) / Math.PI})`}>
              <path d="M0 0 L-9 -5 L-9 5 Z" fill="currentColor" />
            </g>
          </g>
        )
      })}

      {/* center Frequency mark */}
      <g transform={`translate(${cx},${cy})`}>
        <circle r="30" fill="currentColor" className="text-primary" />
        {/* simple radiating "frequency" mark */}
        <g className="text-on-primary">
          <path d="M-14 0 Q -7 -14 0 0 Q 7 14 14 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="0" cy="0" r="3" fill="currentColor" />
        </g>
      </g>

      {/* nodes */}
      {LOOP_NODES.map((label, i) => {
        const p = pts[i]
        const focal = i === 0 // Meet is the focal accent node
        // Label sits radially OUTSIDE its node (along the node's own spoke), so it clears the
        // ring arrows that run between nodes. Cream (same tone as the circles) reads on the ink.
        const lo = nodeR + 22
        const lx = lo * Math.cos(p.a)
        const ly = lo * Math.sin(p.a)
        return (
          <g key={label} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
            <circle r={nodeR} fill="currentColor" className={focal ? 'text-primary-bg' : 'text-surface-elevated'} />
            <circle r={nodeR} fill="none" stroke="currentColor" className={focal ? 'text-primary-strong' : 'text-border-strong'} strokeWidth={focal ? 2 : 1.5} />
            <g className={focal ? 'text-primary-strong' : 'text-muted'}>{loopGlyph(i)}</g>
            <text
              x={lx.toFixed(1)}
              y={ly.toFixed(1)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="currentColor"
              className="text-surface-elevated"
              fontSize="17"
              fontWeight="700"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Small centered glyph per loop node (drawn around 0,0, ~24px box).
function loopGlyph(i: number): React.ReactNode {
  switch (i) {
    case 0: // Meet — two figures
      return (
        <g fill="currentColor">
          <circle cx="-7" cy="-6" r="4.5" /><path d="M-15 8 a8 7 0 0 1 16 0 z" />
          <circle cx="8" cy="-4" r="4" /><path d="M1 9 a7 6 0 0 1 14 0 z" />
        </g>
      )
    case 1: // Scan — QR
      return (
        <g fill="currentColor">
          <rect x="-11" y="-11" width="9" height="9" rx="1.5" /><rect x="2" y="-11" width="9" height="9" rx="1.5" />
          <rect x="-11" y="2" width="9" height="9" rx="1.5" /><rect x="4" y="4" width="5" height="5" />
        </g>
      )
    case 2: // Contacts — contact card
      return (
        <g>
          <rect x="-13" y="-9" width="26" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="-5" cy="0" r="3.5" fill="currentColor" />
          <line x1="3" y1="-3" x2="9" y2="-3" stroke="currentColor" strokeWidth="1.6" /><line x1="3" y1="3" x2="9" y2="3" stroke="currentColor" strokeWidth="1.6" />
        </g>
      )
    case 3: // Invite — envelope + spark
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="-12" y="-8" width="24" height="17" rx="2" /><path d="M-12 -7 L0 3 L12 -7" />
          <g stroke="none" fill="currentColor"><path d="M11 -11 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z" /></g>
        </g>
      )
    case 4: // Join — Frequency mark
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M-12 0 Q -6 -12 0 0 Q 6 12 12 0" />
        </g>
      )
    default: // Return — calendar + return arrow
      return (
        <g>
          <rect x="-12" y="-10" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line x1="-12" y1="-4" x2="12" y2="-4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 3 l-5 0 l0 -5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 3 a5 5 0 1 0 5 -5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </g>
      )
  }
}

// ── BreakEvenGraphic — two cost lines crossing at ~$2,500/mo; shade the region where Business wins. ────
export function BreakEvenGraphic({ className = '' }: { className?: string }) {
  // Plot area
  const x0 = 44, x1 = 396, y0 = 30, y1 = 196
  const cross = 210 // x of the crossing (dashed marker)
  // Free line: 10% on network-sourced sales, rising steeper from origin (no fixed cost).
  const freeStart = { x: x0, y: 180 }
  const freeEnd = { x: x1, y: 44 }
  // Business line: $29/mo + 5% on network-sourced sales (half the rate), higher intercept, flatter slope,
  // crossing Free where the halved rate covers the $29 (about $600/mo of network sales).
  const bizStart = { x: x0, y: 120 }
  const bizEnd = { x: x1, y: 78 }
  return (
    <svg viewBox="0 0 420 230" className={`h-auto w-full ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* axes (minimal, no gridlines) */}
      <g className="text-border-strong">
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="currentColor" strokeWidth="1.5" />
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="currentColor" strokeWidth="1.5" />
      </g>
      {/* shaded win region past the crossing */}
      <g className="text-primary">
        <path d={`M${cross} ${y1} L${x1} ${y1} L${x1} ${y0} L${cross} ${y0} Z`} fill="currentColor" opacity="0.08" />
      </g>
      {/* dashed crossing marker */}
      <g className="text-primary-strong">
        <line x1={cross} y1={y0} x2={cross} y2={y1} stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
        <text x={cross} y={y1 + 18} textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="700">~$600/mo</text>
      </g>
      {/* Free line (quiet) */}
      <g className="text-subtle">
        <line x1={freeStart.x} y1={freeStart.y} x2={freeEnd.x} y2={freeEnd.y} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        <text x={freeEnd.x} y={freeEnd.y - 8} textAnchor="end" fill="currentColor" fontSize="11" fontWeight="600">Free · 10% network</text>
      </g>
      {/* Business line (accent) */}
      <g className="text-primary-strong">
        <line x1={bizStart.x} y1={bizStart.y} x2={bizEnd.x} y2={bizEnd.y} stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" />
        <text x={bizEnd.x} y={bizEnd.y - 8} textAnchor="end" fill="currentColor" fontSize="11" fontWeight="700">Business · $29 + 5% network</text>
      </g>
      {/* x-axis label */}
      <text x={(x0 + x1) / 2} y={224} textAnchor="middle" className="text-subtle" fill="currentColor" fontSize="11">Monthly network sales</text>
    </svg>
  )
}

// ── Feature icon set — one small, consistent set for the feature blocks. ──────────────────────────────
export function FeatureIcon({ name, className = '' }: { name: FunnelIconName; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`h-6 w-6 ${className}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {name === 'calendar' && (<><rect x="5" y="7" width="22" height="20" rx="3" /><line x1="5" y1="13" x2="27" y2="13" /><line x1="11" y1="4" x2="11" y2="9" /><line x1="21" y1="4" x2="21" y2="9" /></>)}
      {name === 'contact' && (<><rect x="4" y="7" width="24" height="18" rx="3" /><circle cx="12" cy="16" r="3.4" /><line x1="19" y1="13" x2="24" y2="13" /><line x1="19" y1="19" x2="24" y2="19" /></>)}
      {name === 'qr' && (<><rect x="5" y="5" width="9" height="9" rx="1.5" /><rect x="18" y="5" width="9" height="9" rx="1.5" /><rect x="5" y="18" width="9" height="9" rx="1.5" /><line x1="19" y1="19" x2="19" y2="24" /><line x1="24" y1="19" x2="24" y2="27" /><line x1="19" y1="27" x2="27" y2="27" /></>)}
      {name === 'envelope' && (<><rect x="4" y="7" width="24" height="18" rx="3" /><path d="M5 9 L16 18 L27 9" /></>)}
      {name === 'spark' && (<path d="M16 4 l2.6 8.4 l8.4 2.6 l-8.4 2.6 l-2.6 8.4 l-2.6 -8.4 l-8.4 -2.6 l8.4 -2.6 z" fill="currentColor" stroke="none" />)}
    </svg>
  )
}
