'use client'

import type { ReactNode } from 'react'
import { Illustration, illustrationNames, type IllustrationName } from '@/components/marketing/illustrations'
import {
  LotusIcon,
  BreatheIcon,
  DialIcon,
  BoltIcon,
  BellCueIcon,
  VibrationIcon,
  OnAirIcon,
} from '@/components/on-air/icons'
import {
  EventArt,
  ContactArt,
  PartnersArt,
  CheckInArt,
  GhostArt,
  MindlessArt,
  MovementArt,
  ConnectArt,
} from '@/components/feed/zap-menu-art'
import { TemplateHeaderArt } from '@/components/circles/template-art'
import { FrequencyArcs, RippleRings, CircleConstellation, OrganicBlob } from '@/components/marketing/vector-art'
import { FeedRender } from '@/components/onboarding/renders/feed-render'
import { CirclesRender } from '@/components/onboarding/renders/circles-render'
import { EventsRender } from '@/components/onboarding/renders/events-render'
import {
  HeroProductGraphic,
  ScatteredStackGraphic,
  SetupStepsGraphic,
  LoopGraphic,
  BreakEvenGraphic,
  FeatureIcon,
} from '@/components/marketing/funnel/funnel-graphics'
import { REGISTRY_NAMES, TEMPLATE_PILLARS, type ElementRegistry } from './element-catalog'

// The Loom's code-drawn element resolver. A library_assets row of kind 'element'
// stores config = { registry, name } (plus an optional pillar for templates); this
// maps that to the live source component so the kit never drifts into stale copies.
// Every branch returns a bare (or span-wrapped) <svg> so the grid's export-to-SVG/PNG
// (which reads the rendered node) works uniformly.

type IconFn = (p: { className?: string }) => ReactNode

const ICONS: Record<string, IconFn> = {
  lotus: (p) => <LotusIcon {...p} />,
  breathe: BreatheIcon,
  dial: DialIcon,
  bolt: BoltIcon,
  'bell-cue': BellCueIcon,
  vibration: VibrationIcon,
  'on-air': OnAirIcon,
  // Operator funnel-door feature icons.
  'funnel-calendar': (p) => <FeatureIcon name="calendar" {...p} />,
  'funnel-contact': (p) => <FeatureIcon name="contact" {...p} />,
  'funnel-qr': (p) => <FeatureIcon name="qr" {...p} />,
  'funnel-envelope': (p) => <FeatureIcon name="envelope" {...p} />,
  'funnel-spark': (p) => <FeatureIcon name="spark" {...p} />,
}

const SPOT: Record<string, IconFn> = {
  event: EventArt,
  contact: ContactArt,
  partners: PartnersArt,
  'check-in': CheckInArt,
  ghost: GhostArt,
  mindless: MindlessArt,
  movement: MovementArt,
  connect: ConnectArt,
  // Operator funnel-door signature scenes.
  'funnel-hero-product': HeroProductGraphic,
  'funnel-scattered-stack': ScatteredStackGraphic,
  'funnel-setup-steps': SetupStepsGraphic,
  'funnel-loop': LoopGraphic,
  'funnel-break-even': BreakEvenGraphic,
}

const TEXTURES: Record<string, IconFn> = {
  'frequency-arcs': FrequencyArcs,
  'ripple-rings': RippleRings,
  'circle-constellation': CircleConstellation,
  'organic-blob': OrganicBlob,
}

// Beta-induction product-page mockups (landscape browser "screens"). They render a bare
// <svg> and take an `animate` flag (off in the catalog); no className.
const RENDERS: Record<string, (p: { animate?: boolean }) => ReactNode> = {
  feed: FeedRender,
  circles: CirclesRender,
  events: EventsRender,
}

function isIllustrationName(name: string): name is IllustrationName {
  return (illustrationNames as readonly string[]).includes(name)
}

/** True when a config `{registry, name}` maps to a drawable element. */
export function isRenderableElement(registry: unknown, name: unknown): boolean {
  if (typeof name !== 'string') return false
  if (registry === 'illustration' || registry == null) return isIllustrationName(name)
  if (registry === 'circle-template') return REGISTRY_NAMES['circle-template'].has(name)
  if (registry === 'icon' || registry === 'spot' || registry === 'texture' || registry === 'render') {
    return REGISTRY_NAMES[registry].has(name)
  }
  return false
}

/**
 * Render a code-drawn element to fill its (definite-height) container. Returns null
 * for an unknown registry/name so the caller can fall back to a placeholder.
 */
export function renderRegistryElement(
  registry: unknown,
  name: unknown,
  pillar?: unknown,
): ReactNode | null {
  if (typeof name !== 'string') return null

  // The marketing illustration kit (default when registry is absent).
  if (registry === 'illustration' || registry == null) {
    return isIllustrationName(name) ? <Illustration name={name} className="h-full" /> : null
  }

  if (registry === 'icon') {
    const Icon = ICONS[name]
    return Icon ? <Icon className="h-full w-auto text-text" /> : null
  }

  if (registry === 'spot') {
    const Art = SPOT[name]
    return Art ? <Art className="block h-full [&>svg]:h-full [&>svg]:w-auto" /> : null
  }

  if (registry === 'texture') {
    const Tex = TEXTURES[name]
    return Tex ? <Tex className="h-full w-auto text-primary" /> : null
  }

  if (registry === 'render') {
    const Screen = RENDERS[name]
    return Screen ? (
      <div className="w-full [&>svg]:h-auto [&>svg]:w-full">
        <Screen animate={false} />
      </div>
    ) : null
  }

  if (registry === 'circle-template') {
    const slug = name
    const resolved =
      (typeof pillar === 'string' && ['mind', 'body', 'spirit', 'expression'].includes(pillar)
        ? (pillar as 'mind' | 'body' | 'spirit' | 'expression')
        : TEMPLATE_PILLARS[slug]) ?? 'spirit'
    if (!REGISTRY_NAMES['circle-template'].has(slug)) return null
    return (
      <div className="h-full w-full overflow-hidden">
        <TemplateHeaderArt slug={slug} primaryPillar={resolved} />
      </div>
    )
  }

  return null
}

export type { ElementRegistry }
