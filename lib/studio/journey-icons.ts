// The journey "face" set (docs/STUDIO.md §2). A journey carries one representative
// icon from this curated lucide set instead of a freeform emoji — it keeps every
// journey on the design system and renders crisp at any size, in any accent. The
// choice is stored in journey_plans.emoji (the column predates the switch; we reuse
// it to hold an icon key). resolveJourneyIcon() maps a stored key — or a legacy
// emoji from before the switch — to its lucide component, so existing journeys keep
// a sensible face without a backfill. Shared (client + server safe).

import {
  Compass, Sprout, Flame, Flower2, Footprints, Dumbbell, NotebookPen,
  BookOpen, Waves, Sun, Moon, Sparkles, Target, HeartPulse, Brain,
  Palette, Guitar, Wrench, Handshake, Feather, Droplets, Mountain,
  Orbit, Star, type LucideIcon,
} from 'lucide-react'

export interface JourneyIcon {
  key: string
  label: string
  Icon: LucideIcon
  /** The legacy emoji this icon supersedes, so pre-switch journeys still resolve. */
  legacy?: string
}

// Curated 24 — one representative icon per common journey theme, ordered to read
// as a tidy 8-wide picker grid. The `legacy` emoji is the one this icon replaces.
export const JOURNEY_ICONS: JourneyIcon[] = [
  { key: 'compass', label: 'Compass', Icon: Compass, legacy: '🧭' },
  { key: 'sprout', label: 'Growth', Icon: Sprout, legacy: '🌱' },
  { key: 'flame', label: 'Fire', Icon: Flame, legacy: '🔥' },
  { key: 'stillness', label: 'Stillness', Icon: Flower2, legacy: '🧘' },
  { key: 'move', label: 'Movement', Icon: Footprints, legacy: '🏃' },
  { key: 'strength', label: 'Strength', Icon: Dumbbell, legacy: '💪' },
  { key: 'journal', label: 'Journal', Icon: NotebookPen, legacy: '📓' },
  { key: 'study', label: 'Study', Icon: BookOpen, legacy: '📖' },
  { key: 'flow', label: 'Flow', Icon: Waves, legacy: '🌊' },
  { key: 'sun', label: 'Sun', Icon: Sun, legacy: '☀️' },
  { key: 'moon', label: 'Moon', Icon: Moon, legacy: '🌙' },
  { key: 'spark', label: 'Spark', Icon: Sparkles, legacy: '✨' },
  { key: 'focus', label: 'Focus', Icon: Target, legacy: '🎯' },
  { key: 'heart', label: 'Heart', Icon: HeartPulse, legacy: '🫀' },
  { key: 'mind', label: 'Mind', Icon: Brain, legacy: '🧠' },
  { key: 'art', label: 'Art', Icon: Palette, legacy: '🎨' },
  { key: 'music', label: 'Music', Icon: Guitar, legacy: '🎸' },
  { key: 'craft', label: 'Craft', Icon: Wrench, legacy: '🛠️' },
  { key: 'connect', label: 'Connect', Icon: Handshake, legacy: '🤝' },
  { key: 'peace', label: 'Peace', Icon: Feather, legacy: '🕊️' },
  { key: 'water', label: 'Water', Icon: Droplets, legacy: '💧' },
  { key: 'summit', label: 'Summit', Icon: Mountain, legacy: '🏔️' },
  { key: 'orbit', label: 'Orbit', Icon: Orbit, legacy: '🌀' },
  { key: 'star', label: 'Star', Icon: Star, legacy: '💫' },
]

export const DEFAULT_JOURNEY_ICON = 'compass'

// One lookup keyed by BOTH the icon key and the legacy emoji, so a stored value
// from either era resolves the same way. Exposed as a plain record so call sites
// resolve by indexing — `JOURNEY_ICON_MAP[value] ?? Compass` — rather than calling
// a function during render (the react-compiler lint forbids component-returning
// calls in render; map access is fine, matching the AREA_ICONS pattern).
export const JOURNEY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  JOURNEY_ICONS.flatMap((i) =>
    i.legacy ? [[i.key, i.Icon] as const, [i.legacy, i.Icon] as const] : [[i.key, i.Icon] as const],
  ),
)

/** The default face when a value is empty or unrecognized. */
export const DefaultJourneyIcon: LucideIcon = Compass
