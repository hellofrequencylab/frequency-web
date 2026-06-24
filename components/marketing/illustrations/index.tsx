import type { ReactNode } from 'react'

// Marketing spot illustrations. Hand-authored inline SVG in the beta-onboarding
// style: simple line-art and flat shapes, DAWN semantic tokens only (Tailwind
// `fill-*` / `stroke-*` map to the palette, so no hex ever ships and the set
// reads in light and dark). Each one evokes a concept with plain geometry
// (people-dots, circles, rays, ripples, a chair, a timer, a calendar). They are
// decorative, so each <svg> carries role="img" + an aria-label and the title +
// body around it carry the meaning.
//
// Animation is opt-in via `animate` and always wrapped in `motion-safe:`, so it
// is dropped automatically when the reader prefers reduced motion.

// ── Shared wrapper ────────────────────────────────────────────────────────────

function Svg({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 240 150" fill="none" role="img" aria-label={label} className="h-full w-auto">
      {children}
    </svg>
  )
}

// A little standing figure (head + shoulders), shared across the people scenes.
function Person({ x, y, s = 1, className }: { x: number; y: number; s?: number; className: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="0" r="9" />
      <path d="M-15 30 a15 16 0 0 1 30 0 z" />
    </g>
  )
}

// ── The set ───────────────────────────────────────────────────────────────────

export const illustrationNames = [
  'lead',
  'practice',
  'spread',
  'circle',
  'feed',
  'events',
  'journey',
  'mindless',
  'quest',
  'lab',
  'community',
  'belonging',
] as const

export type IllustrationName = (typeof illustrationNames)[number]

const ART: Record<IllustrationName, ReactNode> = {
  // Lead, one figure out front, a few following, with a forward arrow.
  lead: (
    <Svg label="A person leading a small group forward">
      <rect x="12" y="14" width="216" height="122" rx="22" className="fill-primary-bg" />
      <Person x={86} y={56} s={1.2} className="fill-primary" />
      <Person x={138} y={72} className="fill-signal" />
      <Person x={170} y={72} className="fill-signal" />
      <g className="stroke-primary-strong" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 104h36m0 0l-10-9m10 9l-10 9" />
      </g>
    </Svg>
  ),

  // Practice, a checklist with a small streak flame, the daily act.
  practice: (
    <Svg label="A short checklist of daily practices">
      <rect x="54" y="20" width="118" height="108" rx="14" className="fill-surface stroke-border-strong" strokeWidth="3" />
      {[44, 72, 100].map((y, i) => (
        <g key={y}>
          <circle cx="76" cy={y} r="9" className={i < 2 ? 'fill-primary' : 'fill-surface stroke-border-strong'} strokeWidth="2.5" />
          {i < 2 && <path d={`M72 ${y} l3 3 5-6`} className="stroke-on-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="92" y={y - 4} width="62" height="8" rx="4" className="fill-border" />
        </g>
      ))}
      <path d="M182 46c8 6 11 14 6 22 9-2 9-12 4-20 10 5 15 19 6 30-8 9-24 7-28-4-3-9 2-20 12-28z" className="fill-signal" />
    </Svg>
  ),

  // Spread, a center point sending ripples outward, the word travelling.
  spread: (
    <Svg label="A signal spreading outward in rings">
      <g className="stroke-primary" strokeWidth="3.5" fill="none">
        <circle cx="120" cy="76" r="22" opacity="0.9" />
        <circle cx="120" cy="76" r="40" opacity="0.55" />
        <circle cx="120" cy="76" r="58" opacity="0.28" />
      </g>
      <circle cx="120" cy="76" r="11" className="fill-primary-strong" />
      <g className="fill-signal">
        <circle cx="120" cy="14" r="6" />
        <circle cx="120" cy="138" r="6" />
        <circle cx="56" cy="76" r="6" />
        <circle cx="184" cy="76" r="6" />
      </g>
    </Svg>
  ),

  // Circle, a ring of people-dots around a warm center.
  circle: (
    <Svg label="People gathered in a circle">
      <circle cx="120" cy="76" r="46" className="stroke-primary" strokeWidth="4" fill="none" />
      <circle cx="120" cy="76" r="14" className="fill-primary-bg" />
      <g className="fill-primary">
        <circle cx="120" cy="30" r="8" />
        <circle cx="120" cy="122" r="8" />
      </g>
      <g className="fill-signal">
        <circle cx="74" cy="76" r="8" />
        <circle cx="166" cy="76" r="8" />
      </g>
      <g className="fill-primary-strong">
        <circle cx="88" cy="44" r="8" />
        <circle cx="152" cy="44" r="8" />
        <circle cx="88" cy="108" r="8" />
        <circle cx="152" cy="108" r="8" />
      </g>
    </Svg>
  ),

  // Feed, a phone with a small stack of posts.
  feed: (
    <Svg label="A phone showing a short feed of posts">
      <rect x="80" y="10" width="80" height="130" rx="16" className="fill-surface stroke-border-strong" strokeWidth="3" />
      {[28, 64, 100].map((y) => (
        <g key={y}>
          <circle cx="100" cy={y + 8} r="7" className="fill-primary" />
          <rect x="114" y={y + 2} width="34" height="6" rx="3" className="fill-border-strong" />
          <rect x="114" y={y + 12} width="22" height="5" rx="2.5" className="fill-border" />
        </g>
      ))}
    </Svg>
  ),

  // Events, a calendar with a marked day and a location pin.
  events: (
    <Svg label="A calendar with a marked day and a location pin">
      <rect x="50" y="26" width="104" height="98" rx="12" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M50 50v-12a12 12 0 0 1 12-12h80a12 12 0 0 1 12 12v12z" className="fill-primary" />
      <g className="fill-border">
        <circle cx="72" cy="72" r="5" />
        <circle cx="94" cy="72" r="5" />
        <circle cx="116" cy="72" r="5" />
        <circle cx="72" cy="94" r="5" />
      </g>
      <circle cx="116" cy="94" r="5" className="fill-primary" />
      <path d="M196 64a22 22 0 0 0-44 0c0 16 22 36 22 36s22-20 22-36z" className="fill-signal" />
      <circle cx="174" cy="64" r="8" className="fill-surface" />
    </Svg>
  ),

  // Journey, a winding path with stops, ending at a flag.
  journey: (
    <Svg label="A winding path with stops along the way">
      <path d="M26 120 C 70 120 70 76 110 76 S 170 32 214 32" className="stroke-border-strong" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray="2 12" />
      <g className="fill-primary">
        <circle cx="26" cy="120" r="8" />
        <circle cx="110" cy="76" r="8" />
      </g>
      <circle cx="68" cy="100" r="7" className="fill-signal" />
      <g className="stroke-primary-strong" strokeWidth="4" strokeLinecap="round">
        <path d="M214 32v-16" />
      </g>
      <path d="M214 16h22l-7 7 7 7h-22z" className="fill-primary-strong" />
    </Svg>
  ),

  // Mindless, a calm lotus mark with a soft pulse ring, the timer.
  mindless: (
    <Svg label="A lotus mark with a calm pulse ring">
      <circle cx="120" cy="80" r="42" className="fill-primary-bg" />
      <g className="stroke-primary" strokeWidth="3.5" fill="none" opacity="0.55">
        <circle cx="120" cy="80" r="56" />
      </g>
      <g className="fill-primary">
        <path d="M120 50c7 12 7 24 0 34-7-10-7-22 0-34z" />
        <path d="M120 84c-12-3-22 2-28 12 12 2 22-3 28-12z" />
        <path d="M120 84c12-3 22 2 28 12-12 2-22-3-28-12z" />
      </g>
      <path d="M98 70c-8 4-12 12-10 20 8-2 13-9 13-18z" className="fill-signal" />
      <path d="M142 70c8 4 12 12 10 20-8-2-13-9-13-18z" className="fill-signal" />
    </Svg>
  ),

  // Quest, a compass star inside a ring, the year-round game.
  quest: (
    <Svg label="A compass star inside a ring">
      <circle cx="120" cy="76" r="50" className="stroke-border-strong" strokeWidth="3.5" fill="none" />
      <path d="M120 30 L132 70 L172 76 L132 82 L120 122 L108 82 L68 76 L108 70 Z" className="fill-primary" />
      <circle cx="120" cy="76" r="9" className="fill-signal" />
      <g className="fill-primary-strong">
        <circle cx="120" cy="20" r="4" />
        <circle cx="176" cy="76" r="4" />
        <circle cx="120" cy="132" r="4" />
        <circle cx="64" cy="76" r="4" />
      </g>
    </Svg>
  ),

  // Lab, a storefront with an awning, the brick-and-mortar home base.
  lab: (
    <Svg label="A small storefront with an awning">
      <rect x="50" y="58" width="140" height="70" rx="6" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M44 58l8-22h136l8 22z" className="fill-primary" />
      <g className="fill-surface">
        <path d="M52 36h24l-4 22H56z" />
        <path d="M100 36h24l-2 22h-22z" />
        <path d="M148 36h24l4 22h-26z" />
      </g>
      <rect x="106" y="92" width="28" height="36" rx="3" className="fill-primary-bg stroke-border-strong" strokeWidth="2.5" />
      <rect x="64" y="74" width="26" height="20" rx="3" className="fill-signal-bg" />
      <rect x="150" y="74" width="26" height="20" rx="3" className="fill-signal-bg" />
    </Svg>
  ),

  // Community, overlapping groups, a few people in each.
  community: (
    <Svg label="Several small groups of people overlapping">
      <circle cx="92" cy="70" r="34" className="stroke-primary" strokeWidth="4" fill="none" />
      <circle cx="148" cy="70" r="34" className="stroke-signal" strokeWidth="4" fill="none" />
      <circle cx="120" cy="100" r="34" className="stroke-primary-strong" strokeWidth="4" fill="none" />
      <g className="fill-primary"><circle cx="84" cy="64" r="6" /><circle cx="100" cy="68" r="6" /></g>
      <g className="fill-signal"><circle cx="144" cy="62" r="6" /><circle cx="156" cy="72" r="6" /></g>
      <g className="fill-primary-strong"><circle cx="112" cy="104" r="6" /><circle cx="128" cy="100" r="6" /></g>
    </Svg>
  ),

  // Belonging, a folding chair with a seat saved for you.
  belonging: (
    <Svg label="A folding chair with a seat saved for you">
      <g className="stroke-primary-strong" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M96 40 L112 98" />
        <path d="M150 40 L134 98" />
        <path d="M88 98 L162 98" />
        <path d="M104 70 L146 70" />
      </g>
      <rect x="92" y="32" width="64" height="14" rx="7" className="fill-primary" />
      <g className="stroke-primary-strong" strokeWidth="5" strokeLinecap="round">
        <path d="M100 98 L92 124" />
        <path d="M146 98 L154 124" />
      </g>
      <rect x="86" y="118" width="76" height="16" rx="8" className="fill-signal" />
      <rect x="98" y="123" width="52" height="6" rx="3" className="fill-on-signal" />
    </Svg>
  ),
}

/**
 * A marketing spot illustration. Pass a `name` from `illustrationNames`; the art
 * scales to fill its box. Set `animate` to let it settle in on mount (respects
 * prefers-reduced-motion via `motion-safe:`).
 */
export function Illustration({
  name,
  className,
  animate = false,
}: {
  name: IllustrationName
  className?: string
  animate?: boolean
}) {
  return (
    <div className={`${className ?? ''} ${animate ? 'motion-safe:animate-[slideUp_0.55s_ease-out_both]' : ''}`.trim()}>
      {ART[name]}
    </div>
  )
}
