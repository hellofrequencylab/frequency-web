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

// A small teardrop flame, for streak runs (shared with the On Air reveal art).
function Flame({ x, y, s = 1, className }: { x: number; y: number; s?: number; className: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -16 C5 -8 9 -3 9 4 A9 9 0 1 1 -9 4 C-9 -3 -5 -8 0 -16 Z"
      className={className}
    />
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
  // Coach lead-funnel set — one element per feature, composable into a flow
  // (see components/marketing/lead-funnel-flow.tsx).
  'spotlight',
  'book',
  'capture',
  'nurture',
  'pipeline',
  // Onboarding + On Air house-style spot art, brought into the shared kit so The
  // Loom holds one canonical copy (welcome deck: components/onboarding/welcome-art.tsx;
  // reveal panels: components/on-air/reveal-art.tsx).
  'welcome',
  'zaps',
  'vera',
  'rewards',
  'streak',
  'stats',
  'dispatch',
  // The rest of Vera's welcome deck (components/onboarding/welcome-art.tsx) — the deck's
  // own take on these, distinct from the kit versions above, so the whole set is catalogued.
  'deck-feed',
  'deck-circles',
  'deck-practices',
  'deck-events',
  // Community Collective infographics (Phase 8, ADR-811): the eight explainers of the model,
  // house-token inline SVG, used across the pricing + marketing surfaces.
  'collective-ladder', // the value ladder (free -> Business -> Collective)
  'earn-together', // we only earn on the business the network brings you
  'two-worlds', // in-collective (connected) vs standalone (walled off)
  'flywheel', // the collaboration flywheel
  'continuum', // solo to collective
  'buildings', // the mission: community-owned rooms
  'four-promises', // the four brand promises
  'five-doors', // the five funnel doors
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

  // ── Coach lead-funnel set ─────────────────────────────────────────────────
  // Each of these five stands alone in the library AND slots into the funnel
  // flow: found on Spotlight → book online → captured in the CRM → automated
  // follow-up → into the pipeline.

  // Spotlight, a coach's public mini-site (link-tree) being discovered — a phone
  // with an avatar + stacked link buttons, framed by a magnifier that finds a person.
  spotlight: (
    <Svg label="A coach's Spotlight page being discovered">
      <rect x="82" y="12" width="76" height="126" rx="15" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M82 46v-19a15 15 0 0 1 15-15h46a15 15 0 0 1 15 15v19z" className="fill-primary-bg" />
      <circle cx="120" cy="40" r="15" className="fill-primary" />
      <circle cx="120" cy="36" r="5" className="fill-surface" />
      <path d="M112 50a8 8 0 0 1 16 0z" className="fill-surface" />
      <rect x="104" y="62" width="32" height="6" rx="3" className="fill-border-strong" />
      {[78, 97, 116].map((y, i) => (
        <g key={y}>
          <rect x="94" y={y} width="52" height="13" rx="6.5" className={i === 1 ? 'fill-signal-bg' : 'fill-primary-bg'} />
          <circle cx="103" cy={y + 6.5} r="3" className={i === 1 ? 'fill-signal' : 'fill-primary'} />
        </g>
      ))}
      <circle cx="170" cy="108" r="15" className="fill-surface stroke-primary-strong" strokeWidth="4" />
      <circle cx="170" cy="104" r="4" className="fill-primary" />
      <path d="M164 114a6 6 0 0 1 12 0z" className="fill-primary" />
      <path d="M181 119l12 12" className="stroke-primary-strong" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  ),

  // Book, an online booking sheet — a calendar-topped card with time slots, one
  // selected and confirmed with a check.
  book: (
    <Svg label="An online booking sheet with a time slot confirmed">
      <rect x="88" y="6" width="7" height="16" rx="3.5" className="fill-primary-strong" />
      <rect x="145" y="6" width="7" height="16" rx="3.5" className="fill-primary-strong" />
      <rect x="64" y="14" width="112" height="122" rx="14" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M64 40v-12a14 14 0 0 1 14-14h84a14 14 0 0 1 14 14v12z" className="fill-primary" />
      {[52, 80, 108].map((y, i) => (
        <g key={y}>
          <rect x="78" y={y} width="84" height="18" rx="9" className={i === 1 ? 'fill-signal' : 'fill-primary-bg'} />
          <circle cx="90" cy={y + 9} r="4" className={i === 1 ? 'fill-on-signal' : 'fill-primary'} />
          <rect x="102" y={y + 5} width="38" height="8" rx="4" className={i === 1 ? 'fill-on-signal' : 'fill-border'} opacity={i === 1 ? 0.45 : 1} />
          {i === 1 && (
            <path d="M147 89l4 4 8-9" className="stroke-on-signal" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          )}
        </g>
      ))}
    </Svg>
  ),

  // Capture, the new lead lands in the CRM — a contact record with an avatar and
  // fields, a lead dropping in from above, and a saved check.
  capture: (
    <Svg label="A new contact captured and saved in the CRM">
      <circle cx="120" cy="18" r="8" className="fill-signal" />
      <path d="M120 28v12" className="stroke-signal-strong" strokeWidth="4" strokeLinecap="round" />
      <path d="M112 40l8 8 8-8z" className="fill-signal-strong" />
      <rect x="52" y="52" width="136" height="80" rx="12" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <circle cx="84" cy="82" r="13" className="fill-primary" />
      <path d="M68 108a16 16 0 0 1 32 0z" className="fill-primary" />
      <rect x="110" y="68" width="62" height="8" rx="4" className="fill-border-strong" />
      <rect x="110" y="84" width="48" height="7" rx="3.5" className="fill-border" />
      <rect x="110" y="98" width="54" height="7" rx="3.5" className="fill-border" />
      <circle cx="176" cy="118" r="13" className="fill-signal" />
      <path d="M170 118l4 4 8-9" className="stroke-on-signal" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),

  // Nurture, the automated follow-up — an envelope with an automation spark and a
  // little run of messages sending out on their own.
  nurture: (
    <Svg label="An automated follow-up sequence sending on its own">
      <rect x="78" y="52" width="96" height="64" rx="10" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M80 56h92l-46 32z" className="fill-primary-bg stroke-border-strong" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="80" cy="48" r="14" className="fill-signal" />
      <path d="M82 40l-9 13h6l-3 11 11-15h-6z" className="fill-on-signal" />
      <g className="fill-signal">
        <circle cx="188" cy="90" r="6" />
        <circle cx="204" cy="82" r="4.5" opacity="0.6" />
        <circle cx="217" cy="75" r="3.5" opacity="0.35" />
      </g>
    </Svg>
  ),

  // Pipeline, the lead moving through stages — three kanban columns, cards
  // advancing left to right, the last one won with a check.
  pipeline: (
    <Svg label="A lead pipeline of stages with a deal won">
      <rect x="20" y="28" width="58" height="98" rx="10" className="fill-primary-bg" />
      <rect x="91" y="28" width="58" height="98" rx="10" className="fill-primary-bg" />
      <rect x="162" y="28" width="58" height="98" rx="10" className="fill-signal-bg" />
      <rect x="31" y="38" width="26" height="6" rx="3" className="fill-primary" />
      <rect x="102" y="38" width="26" height="6" rx="3" className="fill-primary" />
      <rect x="173" y="38" width="26" height="6" rx="3" className="fill-signal" />
      <g>
        <rect x="28" y="54" width="42" height="20" rx="5" className="fill-surface stroke-border" strokeWidth="2" />
        <circle cx="37" cy="64" r="4" className="fill-primary" />
        <rect x="45" y="61" width="20" height="6" rx="3" className="fill-border" />
        <rect x="28" y="80" width="42" height="20" rx="5" className="fill-surface stroke-border" strokeWidth="2" />
      </g>
      <g>
        <rect x="99" y="54" width="42" height="20" rx="5" className="fill-surface stroke-border" strokeWidth="2" />
        <circle cx="108" cy="64" r="4" className="fill-primary" />
        <rect x="116" y="61" width="20" height="6" rx="3" className="fill-border" />
      </g>
      <g>
        <rect x="170" y="54" width="42" height="20" rx="5" className="fill-surface stroke-signal" strokeWidth="2" />
        <path d="M178 64l4 4 8-9" className="stroke-signal" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="196" y="61" width="10" height="6" rx="3" className="fill-signal-bg" />
      </g>
      <g className="stroke-primary-strong" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M81 100h6m0 0l-4-4m4 4l-4 4" />
        <path d="M152 100h6m0 0l-4-4m4 4l-4 4" />
      </g>
    </Svg>
  ),

  // ── Onboarding welcome deck + On Air reveal ───────────────────────────────
  // Ported from the Vera welcome deck and the On Air reveal panels so the kit
  // holds one canonical copy of each (those surfaces keep their own inline art).

  // Welcome, a warm sunrise over a few gathered people.
  welcome: (
    <Svg label="A warm sunrise over a few gathered people">
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

  // Zaps, a lightning bolt rising over a climbing bar chart, with a gem.
  zaps: (
    <Svg label="A lightning bolt rising over a climbing bar chart">
      <g>
        <rect x="58" y="96" width="22" height="34" rx="4" className="fill-primary-bg" />
        <rect x="88" y="78" width="22" height="52" rx="4" className="fill-primary-bg" />
        <rect x="118" y="58" width="22" height="72" rx="4" className="fill-primary/40" />
      </g>
      <path d="M150 22l-26 44h18l-8 40 34-50h-20z" className="fill-primary" />
      <g className="fill-signal">
        <path d="M176 96l10 12-10 16-10-16z" />
        <path d="M166 108h20l-10 16z" className="fill-signal-strong/70" />
      </g>
    </Svg>
  ),

  // Vera, her sparkle-orb mark.
  vera: (
    <Svg label="Vera's sparkle orb mark">
      <circle cx="120" cy="78" r="48" className="fill-primary-bg" />
      <path d="M120 36c5 30 8 34 38 38-30 4-33 8-38 38-5-30-8-34-38-38 30-4 33-8 38-38z" className="fill-primary" />
      <path d="M174 50c2 9 3 10 12 12-9 2-10 3-12 12-2-9-3-10-12-12 9-2 10-3 12-12z" className="fill-signal" />
      <path d="M76 104c1.5 6 2 7 8 8-6 1.5-6.5 2-8 8-1.5-6-2-6.5-8-8 6-1 6.5-2 8-8z" className="fill-signal-strong" />
    </Svg>
  ),

  // Rewards, arcs radiating over a small gathered scene, a zap riding the crest.
  rewards: (
    <Svg label="Rewards radiating over a small gathered group">
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
  ),

  // Streak, a rising run of flames, one per day, the members keeping it lit.
  streak: (
    <Svg label="A rising run of daily streak flames">
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
  ),

  // Stats, a constellation climbing gently, the latest node lit and ringed.
  stats: (
    <Svg label="A gently climbing constellation of stats">
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
      <circle cx="196" cy="56" r="13" className="stroke-primary/60" strokeWidth="2.5" fill="none" />
      <circle cx="196" cy="56" r="7" className="fill-primary" />
    </Svg>
  ),

  // Dispatch, a radio mast on the air, arcs reaching a small listening figure.
  dispatch: (
    <Svg label="A radio mast broadcasting to a listener">
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
  ),

  // ── Welcome deck (the deck's own versions) ────────────────────────────────
  // Ported verbatim from components/onboarding/welcome-art.tsx so the full deck a
  // Founder sees at beta onboarding is catalogued in The Loom.

  // Feed, a phone with a little stack of posts (deck version).
  'deck-feed': (
    <Svg label="A phone showing a short feed of posts">
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

  // Circles, three overlapping groups, each with a couple of people-dots (deck version).
  'deck-circles': (
    <Svg label="Three overlapping circles of people">
      <circle cx="96" cy="72" r="34" className="stroke-primary" strokeWidth="4" />
      <circle cx="146" cy="72" r="34" className="stroke-signal" strokeWidth="4" />
      <circle cx="121" cy="98" r="34" className="stroke-primary-strong" strokeWidth="4" />
      <g className="fill-primary">
        <circle cx="88" cy="66" r="6" />
        <circle cx="104" cy="70" r="6" />
      </g>
      <g className="fill-signal">
        <circle cx="142" cy="64" r="6" />
        <circle cx="154" cy="74" r="6" />
      </g>
      <g className="fill-primary-strong">
        <circle cx="114" cy="104" r="6" />
        <circle cx="130" cy="100" r="6" />
      </g>
    </Svg>
  ),

  // Practices, a checklist with a streak flame (deck version).
  'deck-practices': (
    <Svg label="A checklist of daily practices with a streak flame">
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

  // Events, a calendar with a location pin (deck version).
  'deck-events': (
    <Svg label="A calendar with a location pin">
      <rect x="56" y="26" width="104" height="98" rx="12" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <path d="M56 50v-12a12 12 0 0 1 12-12h80a12 12 0 0 1 12 12v12z" className="fill-primary" />
      <g className="fill-border">
        <circle cx="78" cy="72" r="5" />
        <circle cx="100" cy="72" r="5" />
        <circle cx="122" cy="72" r="5" />
        <circle cx="78" cy="94" r="5" />
      </g>
      <circle cx="122" cy="94" r="5" className="fill-primary" />
      <path d="M168 60a22 22 0 0 0-44 0c0 16 22 36 22 36s22-20 22-36z" className="fill-signal" />
      <circle cx="146" cy="60" r="8" className="fill-surface" />
    </Svg>
  ),

  // ── Community Collective infographics (Phase 8, ADR-811) ──────────────────────
  // House-token inline SVG. Decorative (role=img + aria-label); the heading and body
  // around each one carry the specifics. Semantic tokens only, no hex.

  // The value ladder: three rising rungs (free -> Business -> Collective), a figure stepping up.
  'collective-ladder': (
    <Svg label="A value ladder rising from free to Business to Collective">
      {[
        { x: 30, h: 34 },
        { x: 96, h: 62 },
        { x: 162, h: 92 },
      ].map((b, i) => (
        <g key={b.x}>
          <rect x={b.x} y={128 - b.h} width="48" height={b.h} rx="7" className={i === 2 ? 'fill-primary' : 'fill-primary-bg'} />
          <circle cx={b.x + 24} cy={128 - b.h - 10} r="6" className={i === 2 ? 'fill-primary-strong' : 'fill-primary'} />
        </g>
      ))}
      <path d="M22 132h196" className="stroke-border-strong" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  ),

  // We only earn when you do: a tall stack that is all yours, and a small slice we take from
  // the network-sourced part only.
  'earn-together': (
    <Svg label="You keep everything you bring in; we earn only a small share of network-sourced business">
      <rect x="36" y="34" width="70" height="94" rx="10" className="fill-primary-bg" />
      <path d="M36 44h70M36 58h70M36 72h70M36 86h70M36 100h70M36 114h70" className="stroke-primary/40" strokeWidth="2" />
      <rect x="150" y="96" width="54" height="32" rx="10" className="fill-signal-bg" />
      <rect x="150" y="88" width="54" height="10" rx="5" className="fill-signal" />
      <path d="M63 24h16m-8-8v16" className="stroke-primary-strong" strokeWidth="4" strokeLinecap="round" />
    </Svg>
  ),

  // Two worlds: a connected cluster (in the collective) on the left, a single walled node on the right.
  'two-worlds': (
    <Svg label="In the collective, spaces connect; standalone, a space stands alone">
      <g className="stroke-primary" strokeWidth="3">
        <path d="M52 48L84 88M84 88L44 100M84 88L96 52" />
      </g>
      <g className="fill-primary">
        <circle cx="52" cy="48" r="9" />
        <circle cx="44" cy="100" r="9" />
        <circle cx="96" cy="52" r="9" />
      </g>
      <circle cx="84" cy="88" r="12" className="fill-primary-strong" />
      <path d="M120 22v106" className="stroke-border-strong" strokeWidth="3" strokeDasharray="6 7" />
      <circle cx="182" cy="80" r="13" className="fill-surface stroke-border-strong" strokeWidth="3" />
      <rect x="150" y="44" width="64" height="72" rx="12" className="fill-none stroke-border" strokeWidth="2.5" />
    </Svg>
  ),

  // The collaboration flywheel: circular arrows around a hub, nodes feeding each other.
  'flywheel': (
    <Svg label="A collaboration flywheel: spaces sending each other business, round and round">
      <g className="stroke-primary" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M120 40a36 36 0 0 1 34 46" />
        <path d="M154 96a36 36 0 0 1-58 14" />
        <path d="M92 104a36 36 0 0 1 6-62" />
      </g>
      <g className="fill-primary-strong">
        <path d="M150 78l8 10-13 2z" />
        <path d="M104 118l-12-3 8-9z" />
        <path d="M86 52l4-12 8 9z" />
      </g>
      <circle cx="120" cy="76" r="14" className="fill-primary" />
      <path d="M114 76l4 4 8-9" className="stroke-on-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),

  // Solo to collective: one dot growing into a connected cluster along a rightward path.
  'continuum': (
    <Svg label="From one person to a whole collective">
      <path d="M28 96h184" className="stroke-border-strong" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 10" />
      <circle cx="34" cy="96" r="7" className="fill-primary" />
      <g className="fill-primary">
        <circle cx="110" cy="80" r="7" />
        <circle cx="128" cy="102" r="7" />
      </g>
      <path d="M110 80l18 22" className="stroke-primary" strokeWidth="2.5" />
      <g className="fill-primary-strong">
        <circle cx="188" cy="62" r="8" />
        <circle cx="210" cy="88" r="8" />
        <circle cx="182" cy="106" r="8" />
        <circle cx="206" cy="118" r="8" />
      </g>
      <path d="M188 62l22 26M188 62l-6 44M210 88l-4 30M182 106l24 12" className="stroke-primary/60" strokeWidth="2.5" />
    </Svg>
  ),

  // The mission: community-owned rooms. A simple building with a warm interior and people.
  'buildings': (
    <Svg label="The mission: community-owned rooms, funded together">
      <path d="M60 60l60-30 60 30" className="fill-none stroke-primary-strong" strokeWidth="4" strokeLinejoin="round" />
      <rect x="70" y="60" width="100" height="64" rx="6" className="fill-primary-bg stroke-primary-strong" strokeWidth="3" />
      <rect x="108" y="92" width="24" height="32" rx="3" className="fill-primary" />
      <circle cx="92" cy="86" r="7" className="fill-signal" />
      <circle cx="148" cy="86" r="7" className="fill-signal" />
      <path d="M120 30v-12m0 0l-7 7m7-7l7 7" className="stroke-primary" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // The four promises: four rounded badges, each with a check.
  'four-promises': (
    <Svg label="The four promises: no cut of your bookings, one honest price, leave anytime, see what the network earned you">
      {[
        { x: 44, y: 34 },
        { x: 132, y: 34 },
        { x: 44, y: 86 },
        { x: 132, y: 86 },
      ].map((b) => (
        <g key={`${b.x}-${b.y}`}>
          <rect x={b.x} y={b.y} width="64" height="40" rx="12" className="fill-primary-bg" />
          <circle cx={b.x + 20} cy={b.y + 20} r="11" className="fill-primary" />
          <path d={`M${b.x + 15} ${b.y + 20}l4 4 7-8`} className="stroke-on-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x={b.x + 38} y={b.y + 14} width="18" height="5" rx="2.5" className="fill-primary/50" />
          <rect x={b.x + 38} y={b.y + 23} width="12" height="5" rx="2.5" className="fill-primary/30" />
        </g>
      ))}
    </Svg>
  ),

  // The five funnel doors: five doorways with arrows converging into the collective.
  'five-doors': (
    <Svg label="Five doors into the collective: creators, studios, event hosts, communities, and nonprofits">
      {[36, 74, 112, 150, 188].map((x, i) => (
        <g key={x}>
          <rect x={x} y="30" width="26" height="50" rx="10" className={i === 2 ? 'fill-primary' : 'fill-primary-bg'} />
          <circle cx={x + 19} cy="55" r="2.5" className={i === 2 ? 'fill-on-primary' : 'fill-primary'} />
          <path d={`M${x + 13} 92v14`} className="stroke-primary/60" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
      <path d="M40 118h160" className="stroke-border-strong" strokeWidth="3" strokeLinecap="round" />
      <circle cx="120" cy="118" r="9" className="fill-primary-strong" />
      <path d="M120 118m-4 0l4 4 6-7" className="stroke-on-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
