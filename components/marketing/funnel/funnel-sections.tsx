// OPERATOR FUNNEL DOORS — the section components (ADR-591). The chrome-free template: a minimal splash
// header (logo + one Start free, no nav), a sticky mobile Start free, and the fixed section skeleton, all
// reading from a FunnelConfig. Built on the marketing UI kit (Button, Section) + house tokens; the graphics
// are the inline SVGs in funnel-graphics.tsx. Voice/naming locked (no em dashes).

import Image from 'next/image'
import Link from 'next/link'
import { Button, Section } from '@/components/marketing/marketing-ui'
import { catalogItem } from '@/lib/billing/pricing-keys'
import { formatLoadoutCents } from '@/lib/pricing/loadout'
import {
  type FunnelConfig,
  type FunnelPriceRow,
  FUNNEL_CTA_LABEL,
  FUNNEL_SECONDARY_LABEL,
  MISSION_COPY,
  LOOP_COPY,
  FUNNEL_FOOTER,
  assuranceItems,
} from '@/lib/marketing/funnel-config'
import {
  HeroProductGraphic,
  ScatteredStackGraphic,
  SetupStepGraphic,
  LoopGraphic,
  BreakEvenGraphic,
  FeatureIcon,
} from './funnel-graphics'

/** The Start-free destination. Interim = the Space directory (where a signed-in operator creates a free
 *  Space); funnels P2 replaces this with the real minimal-signup -> createSpace bridge. Attribution is
 *  cookie-based (first-touch captures the landing URL), so no query param is needed here. */
export const FUNNEL_START_HREF = '/spaces'

// ── Chrome: splash header + sticky mobile CTA ─────────────────────────────────────────────────────

export function SplashHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="Frequency home">
          <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} priority className="h-6 w-auto dark:invert sm:h-7" />
        </Link>
        <Button href={FUNNEL_START_HREF} size="sm">
          {FUNNEL_CTA_LABEL}
        </Button>
      </div>
    </header>
  )
}

export function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      <Button href={FUNNEL_START_HREF} className="w-full justify-center" size="lg">
        {FUNNEL_CTA_LABEL}
      </Button>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────────────────────────

export function FunnelHero({ config }: { config: FunnelConfig }) {
  const { hero } = config
  return (
    <Section tone="canvas" pad="pt-12 pb-14 sm:pt-16 sm:pb-20">
      {/* Equal columns give the product card more room so it balances the text block; the buttons keep
          whitespace-nowrap so the CTA row stays on one line. Eyebrow + trust line are left-aligned in
          the text column. */}
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary-strong">{hero.eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl uppercase leading-[1.02] text-text sm:text-5xl lg:text-6xl">
            {hero.h1}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{hero.subhead}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href={FUNNEL_START_HREF} size="lg" className="whitespace-nowrap">
              {FUNNEL_CTA_LABEL}
            </Button>
            <Button href="#how-it-works" variant="ghost" size="lg" className="whitespace-nowrap">
              {FUNNEL_SECONDARY_LABEL}
            </Button>
          </div>
          <p className="mt-4 text-sm text-subtle">{hero.microcopy}</p>
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{hero.trustLine}</p>
        </div>
        <div className="order-first lg:order-last">
          <div className="mx-auto max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-pop sm:p-8">
            <HeroProductGraphic />
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── AssuranceBar ──────────────────────────────────────────────────────────────────────────────────

export function AssuranceBar({ config }: { config: FunnelConfig }) {
  const items = assuranceItems(config)
  return (
    <div className="border-y border-border bg-surface">
      <ul className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
        {items.map((it) => (
          <li key={it} className="flex items-center justify-center gap-2 px-4 py-4 text-center text-xs font-semibold text-muted sm:text-sm">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── ProblemSection ────────────────────────────────────────────────────────────────────────────────

export function ProblemSection({ config }: { config: FunnelConfig }) {
  const { problem } = config
  return (
    <Section tone="surface">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl uppercase leading-tight text-text sm:text-4xl">{problem.header}</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{problem.body}</p>
        </div>
        <figure className="m-0">
          <ScatteredStackGraphic />
          <figcaption className="mt-3 text-center text-sm text-subtle">{problem.caption}</figcaption>
        </figure>
      </div>
    </Section>
  )
}

// ── HowItWorks ────────────────────────────────────────────────────────────────────────────────────

export function HowItWorks({ config }: { config: FunnelConfig }) {
  const { howItWorks } = config
  return (
    <Section tone="canvas" className="scroll-mt-20" >
      <div id="how-it-works" className="scroll-mt-24" />
      <div className="text-center">
        <h2 className="font-display text-3xl uppercase text-text sm:text-4xl">{howItWorks.header}</h2>
      </div>
      {/* One row: the enlarged step graphic on top, its number + title + copy beneath. */}
      <ol className="mx-auto mt-12 grid max-w-5xl gap-10 sm:grid-cols-3 sm:gap-8">
        {howItWorks.steps.map((s, i) => (
          <li key={i} className="flex flex-col items-center text-center">
            <div className="w-full max-w-[220px] rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <SetupStepGraphic step={i as 0 | 1 | 2} />
            </div>
            <span className="mt-6 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
              {i + 1}
            </span>
            <h3 className="mt-3 font-display text-xl uppercase text-text">{s.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-center text-sm text-subtle">{howItWorks.caption}</p>
    </Section>
  )
}

// ── FeatureBlocks (alternating rows) ──────────────────────────────────────────────────────────────

export function FeatureBlocks({ config }: { config: FunnelConfig }) {
  return (
    <Section tone="surface">
      <div className="space-y-5">
        {config.features.map((f, i) => {
          // The third block is the SPINE (the practice grows through the people you meet); give it accent
          // weight so it reads as the hinge into the Loop, not one of four parallel claims.
          const spine = i === 2 && !f.soft
          return (
            <div
              key={f.title}
              className={`flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8 ${
                f.soft
                  ? 'border-dashed border-border bg-canvas'
                  : spine
                    ? 'border-primary/50 bg-primary-bg/50 shadow-sm'
                    : 'border-border bg-surface-elevated'
              } ${i % 2 === 1 ? 'sm:flex-row-reverse' : ''}`}
            >
              <div
                className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  f.soft ? 'bg-surface text-muted' : spine ? 'bg-primary text-on-primary' : 'bg-primary-bg text-primary-strong'
                }`}
              >
                <FeatureIcon name={f.icon} />
              </div>
              <div className={i % 2 === 1 ? 'sm:text-right' : ''}>
                <h3 className={`font-display text-2xl uppercase ${f.soft ? 'text-muted' : spine ? 'text-primary-strong' : 'text-text'}`}>
                  {f.title}
                </h3>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">{f.body}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── LoopDiagram (the signature; the page's one idea made visual). It EXPLAINS itself: a setup line above
//    the diagram and a plain payoff line below, so a cold visitor finishes understanding how a practice
//    grows here. `prominent` enlarges it (community niche); `echo` is the compact repeat after How it works.
export function LoopSection({ config, prominent = false, echo = false }: { config: FunnelConfig; prominent?: boolean; echo?: boolean }) {
  const header = config.loop?.header ?? LOOP_COPY.header
  const intro = echo ? undefined : config.loop?.intro
  const payoff = echo ? undefined : (config.loop?.payoff ?? LOOP_COPY.caption)
  return (
    <Section tone="ink" pad={echo ? 'py-12' : prominent ? 'py-20 sm:py-28' : 'py-16 sm:py-24'}>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl">{header}</h2>
        {intro && <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-on-ink-muted">{intro}</p>}
      </div>
      <div className={`mx-auto mt-10 ${prominent ? 'max-w-2xl' : echo ? 'max-w-sm' : 'max-w-lg'}`}>
        <LoopGraphic />
      </div>
      {payoff && (
        <p className="mx-auto mt-8 max-w-xl text-center text-base leading-relaxed text-on-ink">{payoff}</p>
      )}
    </Section>
  )
}

// ── Pricing (3-row beat; dollar amounts read from the catalog so they never drift) ────────────────

function priceForRow(row: FunnelPriceRow): { price: string; anchor: string | null } {
  if (row.kind === 'free') return { price: '$0', anchor: null }
  if (row.kind === 'resonance') {
    return { price: `+${formatLoadoutCents(catalogItem('addon_ai').month.foundingCents)}`, anchor: null }
  }
  if (row.kind === 'nonprofit') {
    return { price: formatLoadoutCents(catalogItem('nonprofit_seat').month.foundingCents), anchor: null }
  }
  const biz = catalogItem('business_base').month
  return {
    price: formatLoadoutCents(biz.foundingCents),
    anchor: biz.listCents > biz.foundingCents ? formatLoadoutCents(biz.listCents) : null,
  }
}

export function PricingBeat({ config }: { config: FunnelConfig }) {
  const { pricing } = config
  return (
    <Section tone="canvas">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl uppercase text-text sm:text-4xl">{pricing.header}</h2>
        <p className="mt-4 text-lg leading-relaxed text-muted">{pricing.intro}</p>
      </div>

      <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-border">
        {pricing.rows.map((row) => {
          const { price, anchor } = priceForRow(row)
          return (
            <div
              key={row.kind}
              className={`flex items-center justify-between gap-4 px-5 py-5 sm:px-7 ${
                row.featured ? 'bg-primary-bg' : 'bg-surface'
              } ${row.kind !== 'free' ? 'border-t border-border' : ''}`}
            >
              <div>
                <p className={`font-display text-xl uppercase ${row.featured ? 'text-primary-strong' : 'text-text'}`}>
                  {row.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">{row.detail}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="flex items-baseline justify-end gap-2">
                  {anchor && <span className="text-base text-subtle line-through">{anchor}</span>}
                  <span className={`font-display text-2xl ${row.featured ? 'text-primary-strong' : 'text-text'}`}>{price}</span>
                </span>
                {row.kind !== 'free' && <span className="text-xs text-subtle">/mo</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* The break-even PROOF, promoted to a visible callout beside the chart (not fine print). */}
      <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-primary/40 bg-primary-bg/40 p-6 sm:p-7">
        <div className="grid items-center gap-5 sm:grid-cols-[1.05fr_1fr]">
          <BreakEvenGraphic className="w-full" />
          <p className="text-base font-semibold leading-relaxed text-text">{pricing.breakEvenCaption}</p>
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-muted">{pricing.note}</p>

      <div className="mt-7 flex justify-center">
        <Button href={FUNNEL_START_HREF} size="lg">
          {FUNNEL_CTA_LABEL}
        </Button>
      </div>
    </Section>
  )
}

// ── Proof (renders nothing until real testimonials exist) ─────────────────────────────────────────

export interface FunnelTestimonial {
  quote: string
  name: string
  modality: string
  city: string
  videoUrl?: string
}

export function ProofSection({ testimonials }: { testimonials?: FunnelTestimonial[] }) {
  if (!testimonials || testimonials.length === 0) return null
  return (
    <Section tone="surface">
      <div className="grid gap-4 sm:grid-cols-3">
        {testimonials.map((t) => (
          <figure key={t.name} className="m-0 rounded-2xl border border-border bg-surface-elevated p-6">
            <blockquote className="text-base leading-relaxed text-text">“{t.quote}”</blockquote>
            <figcaption className="mt-4 text-sm text-muted">
              <span className="font-semibold text-text">{t.name}</span>, {t.modality}, {t.city}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}

// ── Mission (shared) ──────────────────────────────────────────────────────────────────────────────

export function MissionSection() {
  return (
    <Section tone="canvas">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl uppercase text-text sm:text-4xl">{MISSION_COPY.header}</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted">{MISSION_COPY.body}</p>
      </div>
    </Section>
  )
}

// ── FAQ (native details accordion) ────────────────────────────────────────────────────────────────

export function FaqSection({ config }: { config: FunnelConfig }) {
  return (
    <Section tone="surface">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-display text-3xl uppercase text-text sm:text-4xl">Questions, answered plainly.</h2>
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border">
          {config.faq.map((f) => (
            <details key={f.q} className="group px-5 py-4 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-text marker:hidden">
                {f.q}
                <span className="text-primary-strong transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── FinalCTA (mirrors the hero) ───────────────────────────────────────────────────────────────────

export function FinalCta({ config }: { config: FunnelConfig }) {
  const { finalCta } = config
  return (
    <Section tone="ink" pad="py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl">{finalCta.header}</h2>
        <p className="mt-4 text-lg leading-relaxed text-on-ink-muted">{finalCta.subhead}</p>
        <div className="mt-8 flex justify-center">
          <Button href={FUNNEL_START_HREF} size="lg">
            {FUNNEL_CTA_LABEL}
          </Button>
        </div>
        <p className="mt-4 text-sm text-on-ink-muted">{finalCta.microcopy}</p>
      </div>
    </Section>
  )
}

// ── SplashFooter (shared; no other exits) ─────────────────────────────────────────────────────────

export function SplashFooter() {
  return (
    <footer className="border-t border-border bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 text-center sm:px-8">
        <Image src="/frequency-logo.png" alt="Frequency" width={963} height={170} className="h-6 w-auto dark:invert" />
        <p className="text-sm text-muted">{FUNNEL_FOOTER.tagline}</p>
        <ul className="flex items-center gap-6 text-sm text-subtle">
          {FUNNEL_FOOTER.links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-text">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
