'use client'

import { createElement, type ReactNode } from 'react'
import {
  ArrowRight, Sparkles, Rocket, Gem, Heart, Star, Compass, Flag, Trophy, Users, BookOpen, Bell,
  type LucideIcon,
} from 'lucide-react'
import type { WalkthroughStep, StepAccent } from '@/lib/walkthroughs'

// Shared, presentational slide renderer for Walkthroughs. Used by BOTH the admin
// editor's live preview (Phase A) and the member-facing lightbox (Phase B), so the
// in-app render and the operator's preview never drift. 'use client'-safe and pure:
// it takes a WalkthroughStep and composes the in-app card language (chores-overlay /
// vera-lightbox) with the chosen accent token + layout. Token-only classes — no raw hex.

// The icon picker's small, on-voice set (lucide names stored on the slide as `icon`).
export const STEP_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Gem', Icon: Gem },
  { name: 'Heart', Icon: Heart },
  { name: 'Star', Icon: Star },
  { name: 'Compass', Icon: Compass },
  { name: 'Flag', Icon: Flag },
  { name: 'Trophy', Icon: Trophy },
  { name: 'Users', Icon: Users },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Bell', Icon: Bell },
]
export const ICON_BY_NAME = new Map(STEP_ICONS.map((i) => [i.name, i.Icon]))

// Render a slide's chosen icon by name. A module-scope component so the lookup never
// "creates a component during render" (react-hooks/static-components).
export function StepGlyph({ name, className }: { name: string; className?: string }) {
  const icon = ICON_BY_NAME.get(name)
  return icon ? createElement(icon, { className, 'aria-hidden': true }) : null
}

// Accent token key → the token-driven classes the slide composes. ALL semantic tokens
// from app/globals.css; no raw hex. `solid`/`onSolid` drive the CTA + icon chip, `soft`
// the chip background, `text` the eyebrow.
export const ACCENT_CLASSES: Record<StepAccent, { solid: string; onSolid: string; soft: string; text: string }> = {
  primary: { solid: 'bg-primary', onSolid: 'text-on-primary', soft: 'bg-primary-bg', text: 'text-primary-strong' },
  signal: { solid: 'bg-signal', onSolid: 'text-on-signal', soft: 'bg-signal-bg', text: 'text-signal-strong' },
  broadcast: { solid: 'bg-broadcast', onSolid: 'text-on-broadcast', soft: 'bg-broadcast-bg', text: 'text-broadcast-strong' },
  success: { solid: 'bg-success', onSolid: 'text-white', soft: 'bg-success-bg', text: 'text-success' },
  warning: { solid: 'bg-warning', onSolid: 'text-white', soft: 'bg-warning-bg', text: 'text-warning' },
  'rank-gold': { solid: 'bg-[var(--rank-gold)]', onSolid: 'text-white', soft: 'bg-[var(--rank-gold-bright)]/30', text: 'text-[var(--rank-gold-deep)]' },
  'rank-jade': { solid: 'bg-[var(--rank-jade)]', onSolid: 'text-white', soft: 'bg-[var(--rank-jade-bright)]/30', text: 'text-[var(--rank-jade-deep)]' },
  'rank-teal': { solid: 'bg-[var(--rank-teal)]', onSolid: 'text-white', soft: 'bg-[var(--rank-teal-bright)]/30', text: 'text-[var(--rank-teal-deep)]' },
  'rank-indigo': { solid: 'bg-[var(--rank-indigo)]', onSolid: 'text-white', soft: 'bg-[var(--rank-indigo-bright)]/30', text: 'text-[var(--rank-indigo-deep)]' },
  'rank-plum': { solid: 'bg-[var(--rank-plum)]', onSolid: 'text-white', soft: 'bg-[var(--rank-plum-bright)]/30', text: 'text-[var(--rank-plum-deep)]' },
  'rank-rose': { solid: 'bg-[var(--rank-rose)]', onSolid: 'text-white', soft: 'bg-[var(--rank-rose-bright)]/30', text: 'text-[var(--rank-rose-deep)]' },
}

// The card shell — hoisted so it isn't re-created on every render.
function PreviewCard({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">{children}</div>
}

// A faithful render of a slide in the in-app card language (chores-overlay / vera-lightbox),
// driven by the chosen accent token + layout. Token-only classes — no raw hex.
export function WalkthroughSlide({ step }: { step: WalkthroughStep }) {
  const a = ACCENT_CLASSES[step.accent]

  const eyebrow = (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${a.soft} px-3 py-1 text-2xs font-semibold uppercase tracking-wide ${a.text}`}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden /> Walkthrough
    </span>
  )
  const iconChip = step.icon ? (
    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.soft} ${a.text}`}>
      <StepGlyph name={step.icon} className="h-7 w-7" />
    </span>
  ) : null
  const cta = step.ctaLabel ? (
    <span className={`mt-5 inline-flex items-center gap-1.5 rounded-xl ${a.solid} px-5 py-2.5 text-sm font-semibold ${a.onSolid}`}>
      {step.ctaLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </span>
  ) : null
  const zaps = step.zaps ? (
    <p className={`mt-4 inline-flex items-center gap-1.5 rounded-full ${a.soft} px-3 py-1.5 text-xs font-semibold ${a.text}`}>
      <Gem className="h-3.5 w-3.5" aria-hidden /> +{step.zaps} Zaps
    </p>
  ) : null
  const media = step.mediaUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={step.mediaUrl} alt="" className="h-44 w-full object-cover" />
  ) : (
    <div className={`h-44 w-full ${a.soft}`} />
  )

  if (step.layout === 'media-top') {
    return (
      <PreviewCard>
        {media}
        <div className="flex flex-col items-center px-7 pb-7 pt-6 text-center">
          {eyebrow}
          <h2 className="mt-3 text-2xl font-bold leading-tight text-text">{step.title || 'Slide title'}</h2>
          {step.body && <p className="mt-2 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{step.body}</p>}
          {zaps}
          {cta}
        </div>
      </PreviewCard>
    )
  }

  if (step.layout === 'split') {
    return (
      <PreviewCard>
        <div className="grid sm:grid-cols-2">
          <div className="hidden sm:block">{media}</div>
          <div className="flex flex-col items-start px-6 py-7 text-left">
            {eyebrow}
            <h2 className="mt-3 text-xl font-bold leading-tight text-text">{step.title || 'Slide title'}</h2>
            {step.body && <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.body}</p>}
            {zaps}
            {cta}
          </div>
        </div>
      </PreviewCard>
    )
  }

  // Centered (default)
  return (
    <PreviewCard>
      <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
        {iconChip ?? eyebrow}
        {iconChip && <div className="mt-4">{eyebrow}</div>}
        <h2 className="mt-4 text-2xl font-bold leading-tight text-text">{step.title || 'Slide title'}</h2>
        {step.body && <p className="mt-2 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{step.body}</p>}
        {zaps}
        {cta}
      </div>
    </PreviewCard>
  )
}
