// Spot art for the On Air reveal panels (ADR-229, P4 beauty pass) — drawn in the
// welcome-art language: flat token-colored shapes, little person figures, rounded
// frames. Tailwind `fill-*` / `stroke-*` map to the semantic palette, so the
// scenes sit right in light and dark and never hardcode a hex. Purely decorative:
// each panel's copy carries the meaning, so every <svg> is aria-hidden.

type Props = { className?: string }

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 150" fill="none" aria-hidden className={className}>
      {children}
    </svg>
  )
}

// A little standing figure (head + shoulders) — the welcome-art person, local copy.
function Person({ x, y, s = 1, className }: { x: number; y: number; s?: number; className: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="0" r="9" />
      <path d="M-15 30 a15 16 0 0 1 30 0 z" />
    </g>
  )
}

// A small teardrop flame, for the streak run.
function Flame({ x, y, s = 1, className }: { x: number; y: number; s?: number; className: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -16 C5 -8 9 -3 9 4 A9 9 0 1 1 -9 4 C-9 -3 -5 -8 0 -16 Z"
      className={className}
    />
  )
}

// ① Rewards — the signal pays out: arcs radiating over a small gathered scene,
// a zap bolt riding the crest.
export function RewardsArt({ className }: Props) {
  return (
    <Svg className={className}>
      <rect x="12" y="10" width="216" height="130" rx="22" className="fill-primary-bg/60" />
      <g className="stroke-primary" strokeWidth="3" strokeLinecap="round">
        <path d="M90 124 A30 30 0 0 1 150 124" opacity="0.85" />
        <path d="M68 124 A52 52 0 0 1 172 124" opacity="0.6" />
        <path d="M46 124 A74 74 0 0 1 194 124" opacity="0.4" />
        <path d="M24 124 A96 96 0 0 1 216 124" opacity="0.25" />
      </g>
      <path d="M120 30 l-13 23 h10 l-6 24 19 -28 h-11 z" className="fill-primary" />
      <Person x={84} y={100} s={0.85} className="fill-signal" />
      <Person x={120} y={94} className="fill-primary-strong" />
      <Person x={156} y={100} s={0.85} className="fill-signal" />
    </Svg>
  )
}

// ② Streak — a rising run of flames, one per day, the members keeping it lit.
export function StreakArt({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M44 102 C 84 98, 144 84, 198 50"
        className="stroke-signal"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0.5 9"
        opacity="0.55"
      />
      <Flame x={48} y={100} s={0.6} className="fill-primary/30" />
      <Flame x={84} y={92} s={0.72} className="fill-primary/45" />
      <Flame x={120} y={82} s={0.85} className="fill-primary/65" />
      <Flame x={156} y={68} s={1} className="fill-primary/85" />
      <Flame x={196} y={50} s={1.2} className="fill-primary" />
      <Person x={70} y={101} s={0.62} className="fill-signal" />
      <Person x={112} y={99} s={0.7} className="fill-primary-strong" />
      <Person x={154} y={101} s={0.62} className="fill-signal" />
      <rect x="24" y="120" width="192" height="5" rx="2.5" className="fill-border" />
    </Svg>
  )
}

// ③ Stats — a constellation climbing gently: nodes joined by thin lines, the
// latest one lit and ringed.
export function StatsArt({ className }: Props) {
  return (
    <Svg className={className}>
      <rect x="12" y="10" width="216" height="130" rx="22" className="fill-signal-bg/50" />
      <g className="stroke-border-strong" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
        <path d="M32 112 h176 M32 84 h176 M32 56 h176" strokeDasharray="2 6" />
      </g>
      <g className="fill-border-strong" opacity="0.7">
        <circle cx="58" cy="36" r="2.5" />
        <circle cx="110" cy="28" r="2" />
        <circle cx="166" cy="30" r="2.5" />
      </g>
      <path
        d="M40 114 L78 100 L114 104 L152 82 L196 56"
        className="stroke-signal-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="40" cy="114" r="5" className="fill-signal" />
      <circle cx="78" cy="100" r="6" className="fill-signal" />
      <circle cx="114" cy="104" r="5" className="fill-signal" />
      <circle cx="152" cy="82" r="6" className="fill-signal" />
      <circle cx="196" cy="56" r="13" className="stroke-primary/60" strokeWidth="2.5" />
      <circle cx="196" cy="56" r="7" className="fill-primary" />
    </Svg>
  )
}

// ④ Dispatch — a radio mast on the air, arcs reaching a small listening figure.
export function DispatchArt({ className }: Props) {
  return (
    <Svg className={className}>
      <rect x="20" y="118" width="200" height="4" rx="2" className="fill-border" />
      <g className="stroke-primary-strong" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 118 L70 40 L82 118" />
        <path d="M66 70 h8 M63 90 h14 M60 110 h20" />
      </g>
      <circle cx="70" cy="40" r="5" className="fill-primary" />
      <g className="stroke-primary" strokeWidth="3" strokeLinecap="round">
        <path d="M84.1 25.9 A20 20 0 0 1 84.1 54.1" opacity="0.9" />
        <path d="M96.2 13.8 A37 37 0 0 1 96.2 66.2" opacity="0.6" />
        <path d="M108.2 1.8 A54 54 0 0 1 108.2 78.2" opacity="0.35" />
      </g>
      <g className="stroke-primary" strokeWidth="2.5" strokeLinecap="round">
        <path d="M176 73 l-5 -5 M185 70 v-7 M194 73 l5 -5" />
      </g>
      <Person x={185} y={90} className="fill-signal" />
    </Svg>
  )
}
