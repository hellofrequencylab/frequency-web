import type { LucideIcon } from 'lucide-react'
import { Sparkles, Play, Users } from 'lucide-react'

// The funnel-STYLE registry (ADR-617). One source of truth for the styles the Splash
// Funnels page manages. Adding a new style is a row here, not a page rewrite: the page,
// the create flow, and the grouping all read this list. Each style eventually declares
// its own renderer + editor; today only `onboarding` is live (the existing beta
// induction), and `feature` / `demographic` are planned placeholders.

export type FunnelStyleId = 'onboarding' | 'feature' | 'demographic'
export type FunnelStyleStatus = 'live' | 'planned'

export interface FunnelStyle {
  id: FunnelStyleId
  /** Tab / section label. */
  label: string
  /** Singular noun for copy ("Create an onboarding funnel"). */
  noun: string
  icon: LucideIcon
  blurb: string
  status: FunnelStyleStatus
  /** Full Tailwind class strings (kept static so Tailwind can see them). */
  accent: { chip: string; ring: string; icon: string }
}

export const FUNNEL_STYLES: readonly FunnelStyle[] = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    noun: 'onboarding funnel',
    icon: Sparkles,
    blurb:
      'An audience-tuned front door. The full induction in a specific voice, with a cohort tag so everyone who joins through it stays segmentable.',
    status: 'live',
    accent: {
      chip: 'bg-primary-bg text-primary-strong',
      ring: 'border-primary/40',
      icon: 'bg-primary text-on-primary',
    },
  },
  {
    id: 'feature',
    label: 'Feature',
    noun: 'feature funnel',
    icon: Play,
    blurb:
      'Let a visitor play with one stripped-down feature (Breathwork Visualizer, Meditation Timer, QR Studio, CRM preview) before they ever sign up.',
    status: 'planned',
    accent: {
      chip: 'bg-broadcast-bg text-broadcast-strong',
      ring: 'border-broadcast/40',
      icon: 'bg-broadcast text-on-primary',
    },
  },
  {
    id: 'demographic',
    label: 'Demographic',
    noun: 'demographic funnel',
    icon: Users,
    blurb:
      'A niche teaser tuned to one persona, built from the DAWN teaser infographics. Speaks directly to a single community.',
    status: 'planned',
    accent: {
      chip: 'bg-signal-bg text-signal',
      ring: 'border-signal/40',
      icon: 'bg-signal text-on-primary',
    },
  },
] as const

export const DEFAULT_FUNNEL_STYLE: FunnelStyleId = 'onboarding'

/** Resolve a style by id, defaulting to onboarding (every legacy funnel is onboarding). */
export function funnelStyle(id: string | null | undefined): FunnelStyle {
  return FUNNEL_STYLES.find((s) => s.id === id) ?? FUNNEL_STYLES[0]
}
