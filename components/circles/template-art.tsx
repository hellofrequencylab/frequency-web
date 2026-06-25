import Image from 'next/image'
import type { ReactNode } from 'react'
import type { PillarSlug } from '@/lib/pillars'

// Drawn header art for the twelve Starter Circle blueprints — one bespoke scene
// each, in the house illustration language (components/marketing/illustrations):
// hand-authored inline SVG, simple line-art + flat shapes, DAWN semantic tokens
// ONLY, so no hex ever ships and the set reads in light and dark. Decorative, so
// each <svg> carries role="img" + an aria-label; the surrounding name/copy carries
// the meaning.
//
// Pillar palette mirrors components/journey/v2/pillar-chip.tsx so a header reads as
// its Pillar at a glance:  Mind -> info · Body -> success · Spirit -> primary ·
// Expression -> signal.
//
// Color convention (kept rigid so every scene is correct):
//   • The <Scene> wraps the motif in a `text-<ink>` group, so `currentColor` is the
//     Pillar ink everywhere. Ink fills use fill="currentColor"; ink strokes use
//     stroke="currentColor".
//   • White/paper marks use the `fill-surface` / `stroke-surface` classes.
//   • One darker pop per Pillar via the `accent` class literal (fill-primary-strong,
//     fill-signal-strong; Mind/Body have no -strong token so they reuse the ink).
//   • The field (full-bleed background) is the `field` class on the base rect.
// Every class is a full literal (never `fill-${x}`) so the Tailwind scanner keeps
// the utilities. Each scene is full-bleed with the motif in a central safe zone, so
// the same art crops cleanly into a wide hero band or a 16:9 card via slice.

// ── Palette per Pillar ────────────────────────────────────────────────────────

type Palette = { field: string; ink: string; accent: string }

const PALETTE: Record<PillarSlug, Palette> = {
  mind: { field: 'fill-info-bg', ink: 'text-info', accent: 'fill-info' },
  body: { field: 'fill-success-bg', ink: 'text-success', accent: 'fill-success' },
  spirit: { field: 'fill-primary-bg', ink: 'text-primary', accent: 'fill-primary-strong' },
  expression: { field: 'fill-signal-bg', ink: 'text-signal', accent: 'fill-signal-strong' },
}

// ── Shared primitives ─────────────────────────────────────────────────────────

// 240x110 ≈ 2.2:1. Motifs live in the central safe zone (x 60-180, y 22-86) so the
// slice crop never eats them, whether the band is wide (hero) or 16:9 (card).
function Scene({ label, palette, children }: { label: string; palette: Palette; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 240 110"
      fill="none"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
    >
      <rect x="0" y="0" width="240" height="110" className={palette.field} />
      {/* text-<ink> → currentColor is the Pillar ink for every child. */}
      <g className={palette.ink}>{children}</g>
    </svg>
  )
}

// A faint concentric-ring texture (the brand "frequency" motif) that ties the set
// together. Inherits currentColor (the Pillar ink), low opacity, behind the motif.
function Ripple({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      {[18, 34, 50].map((r, i) => (
        <circle key={r} cx={cx} cy={cy} r={r} opacity={0.16 - i * 0.04} />
      ))}
    </g>
  )
}

// ── The twelve scenes ─────────────────────────────────────────────────────────
// Keyed by template slug. `accent` is the one darker pop class for the Pillar.

const SCENES: Record<string, (accent: string) => ReactNode> = {
  // MIND ───────────────────────────────────────────────────────────────────────
  // The Reading Room — an open book.
  'the-reading-room': (accent) => (
    <>
      <Ripple cx={196} cy={26} />
      <path d="M120 38c-14-9-32-9-46-4v50c14-5 32-5 46 4z" fill="currentColor" />
      <path d="M120 38c14-9 32-9 46-4v50c-14-5-32-5-46 4z" className={accent} />
      <path d="M120 38v50" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
      <g className="stroke-surface" strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <path d="M86 48h24M86 58h24M86 68h18" />
        <path d="M130 48h24M130 58h24M130 68h18" />
      </g>
    </>
  ),

  // Compound — three coins stacking, a quiet up-arrow: money that grows.
  compound: (accent) => (
    <>
      <Ripple cx={64} cy={30} />
      <g className="stroke-surface" strokeWidth="2" opacity="0.9">
        <ellipse cx="112" cy="78" rx="26" ry="9" fill="currentColor" />
        <ellipse cx="112" cy="64" rx="26" ry="9" fill="currentColor" />
        <ellipse cx="112" cy="50" rx="26" ry="9" className={accent} />
      </g>
      <path
        d="M150 60l16-16 16 16"
        className={accent}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M166 44v34" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </>
  ),

  // Game Night — a board grid with two pieces.
  'game-night': (accent) => (
    <>
      <Ripple cx={188} cy={30} />
      <rect x="92" y="30" width="56" height="56" rx="6" fill="currentColor" />
      <g className="fill-surface" opacity="0.85">
        <rect x="100" y="38" width="12" height="12" />
        <rect x="124" y="38" width="12" height="12" />
        <rect x="112" y="50" width="12" height="12" />
        <rect x="100" y="62" width="12" height="12" />
        <rect x="124" y="62" width="12" height="12" />
      </g>
      <circle cx="106" cy="44" r="6" className={accent} />
      <circle cx="134" cy="68" r="6" className="fill-surface" />
    </>
  ),

  // BODY ────────────────────────────────────────────────────────────────────────
  // Run Club — a runner mid-stride, motion lines, the road.
  'run-club': (accent) => (
    <>
      <Ripple cx={188} cy={28} />
      <path d="M64 88h112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <circle cx="120" cy="34" r="8" className={accent} />
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M118 44l-6 16 12 8-4 16" />
        <path d="M112 60l-14 6" />
        <path d="M124 68l14-4" />
      </g>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5">
        <path d="M74 50h16M70 64h12" />
      </g>
    </>
  ),

  // The Trailhead — peaks, a winding trail, a small summit flag.
  'the-trailhead': (accent) => (
    <>
      <Ripple cx={64} cy={28} />
      <path d="M70 84l28-40 18 24 14-20 30 36z" fill="currentColor" />
      <path d="M116 68l14-20 30 36h-32z" className={accent} />
      <path
        d="M78 86c14-2 16-14 28-14s14 12 28 12"
        className="stroke-surface"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 8"
        opacity="0.9"
      />
      <path d="M144 48v-18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M144 30l14 4-14 5z" className={accent} />
    </>
  ),

  // Pickup — a paddle and ball over a net line.
  pickup: (accent) => (
    <>
      <Ripple cx={186} cy={30} />
      <path d="M108 84v-8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="108" cy="50" rx="22" ry="26" fill="currentColor" />
      <g className="fill-surface" opacity="0.85">
        <circle cx="100" cy="44" r="3" />
        <circle cx="116" cy="44" r="3" />
        <circle cx="108" cy="56" r="3" />
        <circle cx="100" cy="60" r="3" />
        <circle cx="116" cy="60" r="3" />
      </g>
      <circle cx="150" cy="40" r="10" className={accent} />
      <path d="M76 84h88" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
    </>
  ),

  // SPIRIT ────────────────────────────────────────────────────────────────────
  // Still — a seated figure, a calm pulse ring.
  still: (accent) => (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" opacity="0.4">
        <circle cx="120" cy="58" r="40" />
      </g>
      <circle cx="120" cy="40" r="10" className={accent} />
      <path d="M120 54c-16 0-26 12-26 30h52c0-18-10-30-26-30z" fill="currentColor" />
      <path
        d="M94 84c8-8 18-8 26-8s18 0 26 8"
        className="stroke-surface"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.8"
      />
    </>
  ),

  // The Deep End — two figures turned toward each other, a thread between them.
  'the-deep-end': (accent) => (
    <>
      <Ripple cx={120} cy={56} />
      <path
        d="M86 60c12-6 12 6 24 6s12-12 24-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <g fill="currentColor">
        <circle cx="92" cy="48" r="11" />
        <path d="M74 86a18 19 0 0 1 36 0z" />
      </g>
      <g className={accent}>
        <circle cx="148" cy="48" r="11" />
        <path d="M130 86a18 19 0 0 1 36 0z" />
      </g>
    </>
  ),

  // The Table — a shared table, two plates, a warm hanging light.
  'the-table': (accent) => (
    <>
      <Ripple cx={188} cy={28} />
      <path d="M120 24v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M108 38a12 12 0 0 0 24 0z" className={accent} />
      <rect x="74" y="70" width="92" height="10" rx="5" fill="currentColor" />
      <path d="M84 80l6 12M156 80l-6 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="64" r="10" className="fill-surface" />
      <circle cx="140" cy="64" r="10" className="fill-surface" />
      <circle cx="100" cy="64" r="4" className={accent} />
      <circle cx="140" cy="64" r="4" className={accent} />
    </>
  ),

  // EXPRESSION ──────────────────────────────────────────────────────────────────
  // The Makers — a paint palette and brush.
  'the-makers': (accent) => (
    <>
      <Ripple cx={186} cy={30} />
      <path
        d="M104 38c-22 0-38 14-38 30 0 8 6 12 14 12 6 0 8-4 14-4 5 0 8 4 8 10 16 0 30-14 30-30s-14-18-28-18z"
        fill="currentColor"
      />
      <g className="fill-surface" opacity="0.9">
        <circle cx="92" cy="50" r="4" />
        <circle cx="110" cy="46" r="4" />
        <circle cx="86" cy="66" r="4" />
      </g>
      <circle cx="120" cy="60" r="4" className={accent} />
      <path d="M140 44l22 22" className={accent} stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M134 38l10 10-6 6-10-10z" fill="currentColor" />
    </>
  ),

  // Sound — two notes riding a waveform.
  sound: (accent) => (
    <>
      <Ripple cx={66} cy={30} />
      <path
        d="M64 58c8-14 14 14 22 0s14 14 22 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path d="M126 34v40" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M158 28v40" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M126 34l32-6" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="120" cy="76" rx="11" ry="8" fill="currentColor" />
      <ellipse cx="152" cy="70" rx="11" ry="8" className={accent} />
    </>
  ),

  // The Writers' Room — a sheet of lined paper and a pen.
  'the-writers-room': (accent) => (
    <>
      <Ripple cx={188} cy={30} />
      <rect x="84" y="30" width="56" height="56" rx="5" fill="currentColor" />
      <g className="stroke-surface" strokeWidth="2.5" strokeLinecap="round" opacity="0.85">
        <path d="M94 44h36M94 54h36M94 64h24" />
      </g>
      <path d="M150 38l16 16-30 30-18 4 4-18z" className={accent} />
      <path d="M150 38l16 16" className="stroke-surface" strokeWidth="2.5" opacity="0.6" />
    </>
  ),
}

const LABELS: Record<string, string> = {
  'the-reading-room': 'An open book',
  compound: 'Coins stacking with an upward arrow',
  'game-night': 'A game board with two pieces',
  'run-club': 'A runner mid-stride',
  'the-trailhead': 'Mountain peaks with a trail and a summit flag',
  pickup: 'A paddle and ball over a net',
  still: 'A seated figure inside a calm ring',
  'the-deep-end': 'Two figures turned toward each other',
  'the-table': 'A shared table set for two with a hanging light',
  'the-makers': 'A paint palette and brush',
  sound: 'Two music notes riding a waveform',
  'the-writers-room': 'A sheet of lined paper and a pen',
}

// ── Public components ─────────────────────────────────────────────────────────

/** The drawn header for one template — full-bleed, fills its container. Falls back
 *  to a generic ripple-on-field for an unknown slug (e.g. a brand-new template). */
export function TemplateHeaderArt({
  slug,
  primaryPillar,
}: {
  slug: string
  primaryPillar: PillarSlug
}) {
  const palette = PALETTE[primaryPillar] ?? PALETTE.spirit
  const scene = SCENES[slug]
  const label = LABELS[slug] ?? 'A Starter Circle'
  return (
    <Scene label={label} palette={palette}>
      {scene ? (
        scene(palette.accent)
      ) : (
        <>
          <Ripple cx={120} cy={55} />
          <g fill="currentColor">
            <circle cx="120" cy="34" r="9" />
            <circle cx="92" cy="64" r="9" />
            <circle cx="148" cy="64" r="9" />
          </g>
        </>
      )}
    </Scene>
  )
}

/**
 * A template's cover slot. Shows the operator-uploaded photo (image_url) when set,
 * otherwise the drawn vector header. Caller owns the framed box (relative, clipped);
 * this fills it. Used in the gallery card cover, the Starter preview hero, and the
 * admin editor preview.
 */
export function TemplateCover({
  imageUrl,
  name,
  slug,
  primaryPillar,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px',
  priority = false,
}: {
  imageUrl: string | null
  name: string
  slug: string
  primaryPillar: PillarSlug
  sizes?: string
  priority?: boolean
}) {
  if (imageUrl) {
    return <Image src={imageUrl} alt={name} fill sizes={sizes} priority={priority} className="object-cover" />
  }
  return <TemplateHeaderArt slug={slug} primaryPillar={primaryPillar} />
}
