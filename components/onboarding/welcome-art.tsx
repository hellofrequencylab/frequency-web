import type { DeckArt } from '@/lib/onboarding/vera-welcome'

// Vector spot-illustrations for Vera's welcome deck — one calm, friendly diagram of
// the surface each slide explains. Theme-token colors only (Tailwind `fill-*` /
// `stroke-*` map to the semantic palette), so they sit right in light and dark and
// never hardcode a hex. Purely decorative: the slide's title + body carry meaning,
// so the <svg> is aria-hidden.

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 150" fill="none" role="img" aria-hidden className="h-full w-auto">
      {children}
    </svg>
  )
}

// A little standing figure (head + shoulders), used across the community scenes.
function Person({ x, y, s = 1, className }: { x: number; y: number; s?: number; className: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="0" r="9" />
      <path d="M-15 30 a15 16 0 0 1 30 0 z" />
    </g>
  )
}

const ART: Record<DeckArt, React.ReactNode> = {
  // Welcome — a warm sunrise over a few gathered people.
  welcome: (
    <Svg>
      <rect x="12" y="12" width="216" height="126" rx="22" className="fill-primary-bg" />
      <g className="stroke-primary" strokeWidth="4" strokeLinecap="round">
        <path d="M120 26v14M88 34l7 12M152 34l-7 12M64 58l13 6M176 58l-13 6" />
      </g>
      <circle cx="120" cy="86" r="26" className="fill-primary" />
      <Person x={74} y={84} className="fill-signal" />
      <Person x={120} y={78} s={1.15} className="fill-primary-strong" />
      <Person x={166} y={84} className="fill-signal" />
      <rect x="12" y="120" width="216" height="18" className="fill-primary/20" />
    </Svg>
  ),

  // Feed — a phone with a little stack of posts.
  feed: (
    <Svg>
      <rect x="78" y="10" width="84" height="130" rx="16" className="fill-surface stroke-border-strong" strokeWidth="3" />
      {[28, 64, 100].map((y) => (
        <g key={y}>
          <circle cx="98" cy={y + 8} r="7" className="fill-primary" />
          <rect x="112" y={y + 2} width="38" height="6" rx="3" className="fill-border-strong" />
          <rect x="112" y={y + 12} width="26" height="5" rx="2.5" className="fill-border" />
        </g>
      ))}
    </Svg>
  ),

  // Circles — three overlapping groups, each with a couple of people-dots.
  circles: (
    <Svg>
      <circle cx="96" cy="72" r="34" className="stroke-primary" strokeWidth="4" />
      <circle cx="146" cy="72" r="34" className="stroke-signal" strokeWidth="4" />
      <circle cx="121" cy="98" r="34" className="stroke-primary-strong" strokeWidth="4" />
      <g className="fill-primary"><circle cx="88" cy="66" r="6" /><circle cx="104" cy="70" r="6" /></g>
      <g className="fill-signal"><circle cx="142" cy="64" r="6" /><circle cx="154" cy="74" r="6" /></g>
      <g className="fill-primary-strong"><circle cx="114" cy="104" r="6" /><circle cx="130" cy="100" r="6" /></g>
    </Svg>
  ),

  // Practices — a checklist with a streak flame.
  practices: (
    <Svg>
      <rect x="54" y="22" width="118" height="106" rx="14" className="fill-surface stroke-border-strong" strokeWidth="3" />
      {[44, 72, 100].map((y, i) => (
        <g key={y}>
          <circle cx="76" cy={y} r="9" className={i < 2 ? 'fill-primary' : 'fill-surface stroke-border-strong'} strokeWidth="2.5" />
          {i < 2 && <path d={`M72 ${y} l3 3 5-6`} className="stroke-on-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="92" y={y - 4} width="62" height="8" rx="4" className="fill-border" />
        </g>
      ))}
      <path d="M180 44c8 6 11 14 6 22 9-2 9-12 4-20 10 5 15 19 6 30-8 9-24 7-28-4-3-9 2-20 12-28z" className="fill-primary" />
    </Svg>
  ),

  // Events — a calendar with a location pin.
  events: (
    <Svg>
      <rect x="56" y="26" width="104" height="98" rx="12" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M56 50v-12a12 12 0 0 1 12-12h80a12 12 0 0 1 12 12v12z" className="fill-primary" />
      <g className="fill-border"><circle cx="78" cy="72" r="5" /><circle cx="100" cy="72" r="5" /><circle cx="122" cy="72" r="5" /><circle cx="78" cy="94" r="5" /></g>
      <circle cx="122" cy="94" r="5" className="fill-primary" />
      <path d="M168 60a22 22 0 0 0-44 0c0 16 22 36 22 36s22-20 22-36z" className="fill-signal" />
      <circle cx="146" cy="60" r="8" className="fill-surface" />
    </Svg>
  ),

  // Zaps — a lightning bolt rising over a climbing bar chart, with a gem.
  zaps: (
    <Svg>
      <g>
        <rect x="58" y="96" width="22" height="34" rx="4" className="fill-primary-bg" />
        <rect x="88" y="78" width="22" height="52" rx="4" className="fill-primary-bg" />
        <rect x="118" y="58" width="22" height="72" rx="4" className="fill-primary/40" />
      </g>
      <path d="M150 22l-26 44h18l-8 40 34-50h-20z" className="fill-primary" />
      <g className="fill-signal"><path d="M176 96l10 12-10 16-10-16z" /><path d="M166 108h20l-10 16z" className="fill-signal-strong/70" /></g>
    </Svg>
  ),

  // Vera — a sparkle orb (her mark).
  vera: (
    <Svg>
      <circle cx="120" cy="78" r="48" className="fill-primary-bg" />
      <path d="M120 36c5 30 8 34 38 38-30 4-33 8-38 38-5-30-8-34-38-38 30-4 33-8 38-38z" className="fill-primary" />
      <path d="M174 50c2 9 3 10 12 12-9 2-10 3-12 12-2-9-3-10-12-12 9-2 10-3 12-12z" className="fill-signal" />
      <path d="M76 104c1.5 6 2 7 8 8-6 1.5-6.5 2-8 8-1.5-6-2-6.5-8-8 6-1 6.5-2 8-8z" className="fill-signal-strong" />
    </Svg>
  ),
}

export function WelcomeArt({ art, className }: { art: DeckArt; className?: string }) {
  return <div className={className}>{ART[art]}</div>
}
