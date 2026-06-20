// ─────────────────────────────────────────────────────────────────────────────
// INTENTIONAL marketing-only variant set (DECISION, not drift; Phase 0.5.12).
//
// The `Card` and `Button` exported here are a DELIBERATE parallel to the in-app
// kit (`components/cards/entity-card.tsx` `EntityCard` + `components/ui/button.tsx`
// `Button`). They are NOT a duplicate to consolidate away. They serve the public
// marketing surface only, whose visual language is distinct by design:
//
//   · Editorial scale + the Anton display face, `shadow-pop` "pop" elevation, the
//     warm `bg-marketing-canvas` / `bg-slat` ink bands: the splash/discover look,
//     NOT the calm in-app community canvas.
//   · The marketing `Button` is always a navigation (renders a `<Link>`/`<a>`),
//     never an action button with the in-app variants/states; the marketing `Card`
//     carries marketing tones (`soft`/`feature`/`elevated`), not entity-browse chrome.
//
// All colors are DAWN semantic tokens (no raw hex/palette), so a branded space still
// re-themes these. Keep the two kits SEPARATE: in-app pages compose the kit per
// docs/PAGE-FRAMEWORK.md; only the public marketing pages import from here.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { SiteImage } from '@/components/marketing/site-image'

// Full-bleed photo hero — the editorial counterpart to PageHero, for pages that
// open on imagery. Warm ink wash + amber glow + LED light-strip seam, matching
// the splash and the Discover heroes. The one uniform hero across the site.
export function PhotoHero({
  image,
  alt = '',
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  focal = 'object-center',
  minHeight,
}: {
  image: string
  alt?: string
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  children?: React.ReactNode
  /** Optional slot below the CTA (trust line, scroll cue) — used by the splash. */
  footer?: React.ReactNode
  focal?: string
  /** `'screen'` makes the hero a full-viewport, center-anchored landing beat. */
  minHeight?: 'screen'
}) {
  const isScreen = minHeight === 'screen'
  return (
    <section
      className={`relative overflow-hidden ${
        isScreen ? 'min-h-screen flex flex-col items-center justify-center' : ''
      }`}
    >
      <Image src={image} alt={alt} fill preload sizes="100vw" className={`object-cover ${focal}`} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(20 18 16 / 0.80) 0%, rgb(20 18 16 / 0.62) 45%, rgb(20 18 16 / 0.95) 100%)',
        }}
      />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div
        className={`relative z-10 mx-auto px-6 text-center ${
          isScreen ? 'max-w-5xl py-20 sm:py-28' : 'max-w-4xl py-24 sm:py-32'
        }`}
      >
        {eyebrow && (
          <p
            className={`font-bold uppercase tracking-[0.25em] text-primary ${
              isScreen ? 'text-sm sm:text-base mb-4' : 'text-sm mb-5'
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-display uppercase text-white text-balance leading-[0.95] ${
            isScreen ? 'text-6xl sm:text-7xl lg:text-8xl' : 'text-5xl sm:text-6xl lg:text-7xl'
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`text-white/80 leading-relaxed mx-auto max-w-2xl ${
              isScreen ? 'mt-5 text-lg sm:text-xl' : 'mt-6 text-base sm:text-lg'
            }`}
          >
            {subtitle}
          </p>
        )}
        {children && <div className={isScreen ? 'mt-7' : 'mt-9'}>{children}</div>}
        {footer}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
    </section>
  )
}

// ── Shared building blocks for the public marketing pages ─────────────────────
// Editorial treatment: heavy condensed display headings (.font-display from the
// Anton face), accent-colored keywords, italic kickers. Token-only colors.

export function PageHero({
  eyebrow,
  title,
  subtitle,
  pad,
  vis = '',
}: {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  pad?: string
  vis?: string
}) {
  return (
    <section className={`px-6 ${pad ?? 'pt-24 pb-14 sm:pt-32 sm:pb-20'} ${vis}`}>
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && (
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-5">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display uppercase text-text text-5xl sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-7 text-xl text-muted leading-relaxed max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  )
}

export function Section({
  children,
  tone = 'surface',
  className = '',
  pad,
  vis = '',
}: {
  children: React.ReactNode
  tone?: 'surface' | 'canvas' | 'ink'
  className?: string
  pad?: string
  vis?: string
}) {
  const bg =
    tone === 'canvas'
      ? 'bg-marketing-canvas'
      : tone === 'ink'
        ? 'bg-slat text-on-ink'
        : 'bg-surface'
  return (
    <section className={`px-6 ${pad ?? 'py-20 sm:py-24'} ${bg} ${vis} ${className}`}>
      <div className="max-w-3xl mx-auto">{children}</div>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  kicker,
}: {
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
}) {
  return (
    <div className="mb-9">
      {eyebrow && (
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">{title}</h2>
      {kicker && <p className="mt-4 text-xl italic text-muted">{kicker}</p>}
    </div>
  )
}

// Editorial pull-quote — a centered, oversized display blockquote with an
// uppercase attribution. Wrap accent words in <span className="text-primary">.
// Distinct from Statement (no attribution; this carries a voice).
export function PullQuote({
  children,
  cite,
  tone = 'canvas',
}: {
  children: React.ReactNode
  cite?: string
  tone?: 'surface' | 'canvas' | 'ink'
}) {
  const isInk = tone === 'ink'
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : isInk ? 'bg-slat' : 'bg-surface'
  return (
    <section className={`${bg} px-6 py-20 sm:py-24`}>
      <figure className="max-w-3xl mx-auto text-center">
        <blockquote
          className={`font-display uppercase text-3xl sm:text-4xl lg:text-5xl leading-[1.08] text-balance ${
            isInk ? 'text-on-ink' : 'text-text'
          }`}
        >
          {children}
        </blockquote>
        {cite && (
          <figcaption
            className={`mt-7 text-sm font-bold uppercase tracking-[0.25em] ${
              isInk ? 'text-on-ink-subtle' : 'text-subtle'
            }`}
          >
            {cite}
          </figcaption>
        )}
      </figure>
    </section>
  )
}

// Big display stat — promoted from the splash so counts look identical sitewide.
export function Stat({
  value,
  label,
  tone = 'light',
}: {
  value: number | string
  label: string
  tone?: 'light' | 'ink'
}) {
  const isInk = tone === 'ink'
  return (
    <div>
      <p className={`font-display text-6xl sm:text-7xl ${isInk ? 'text-on-ink' : 'text-text'}`}>
        {value}
      </p>
      <p
        className={`text-xs uppercase tracking-widest font-bold mt-3 ${
          isInk ? 'text-on-ink-subtle' : 'text-subtle'
        }`}
      >
        {label}
      </p>
    </div>
  )
}

// The one FAQ disclosure for marketing. Native <details>/<summary> so the
// section stays a Server Component (no client JS), with the ChevronDown rotate
// as the single canonical indicator (retires pricing's `+` and home's copy).
export function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface px-6 py-5 shadow-sm [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-left select-none">
        <span className="text-lg font-semibold text-text leading-snug">{q}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4 text-base leading-relaxed text-muted">{children}</div>
    </details>
  )
}

// Stacked FAQ list from a {q, a} array, at the shared vertical rhythm.
export function FaqList({ items }: { items: readonly { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="space-y-3">
      {items.map((f) => (
        <Faq key={f.q} q={f.q}>
          {f.a}
        </Faq>
      ))}
    </div>
  )
}

// The one marketing button. Retires the ~12 hand-rolled `<Link>` CTAs whose
// padding/radius/shadow wobbled page to page. `primary` is the amber action;
// `secondary` is the quiet outline; `ghost` is the inline text link. Renders an
// <a>/<Link> (every marketing CTA is a navigation).
export function Button({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'px-5 py-2.5 text-sm gap-1.5',
    md: 'px-8 py-3.5 text-base gap-2',
    lg: 'px-10 py-4 text-lg gap-2',
  } as const
  const variants = {
    primary: 'text-emboss bg-primary text-white hover:bg-primary-hover shadow-pop',
    secondary: 'border border-border bg-surface text-text hover:bg-surface-elevated',
    ghost: 'text-primary-strong hover:underline',
  } as const
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-2xl font-bold transition-colors ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

// The one marketing surface card. Soft by default; pass `feature` for a hairline
// box and `elevated` for the pop shadow. Replaces the 6+ bespoke card shapes that
// drifted in padding/radius across the splash + discover pages.
export function Card({
  children,
  tone = 'soft',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'soft' | 'feature' | 'elevated'
  className?: string
}) {
  const tones = {
    soft: 'bg-surface-elevated/60',
    feature: 'border border-border bg-surface shadow-sm',
    elevated: 'border border-border bg-surface shadow-pop',
  } as const
  return <div className={`rounded-2xl p-6 ${tones[tone]} ${className}`}>{children}</div>
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-xl text-text/85 leading-relaxed mb-6">{children}</p>
}

// Numbered how-it-works steps — big display numerals, no imagery, so the
// "what you actually do" reads at a glance. Used on the home + how-it-works.
export function Steps({
  steps,
  tone = 'surface',
}: {
  steps: readonly { title: string; body: React.ReactNode }[]
  tone?: 'surface' | 'canvas' | 'ink'
}) {
  const isInk = tone === 'ink'
  return (
    <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
      {steps.map((s, i) => (
        <div key={i} className="relative">
          <span className="font-display text-5xl sm:text-6xl text-primary leading-none">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3
            className={`mt-3 font-display uppercase text-2xl ${isInk ? 'text-on-ink' : 'text-text'}`}
          >
            {s.title}
          </h3>
          <p className={`mt-2 text-base leading-relaxed ${isInk ? 'text-on-ink-muted' : 'text-muted'}`}>
            {s.body}
          </p>
        </div>
      ))}
    </div>
  )
}


export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-lg text-muted leading-relaxed mb-6">{children}</p>
}

// Big full-width typographic interstitial. Wrap accent words in
// <span className="text-primary"> inside children.
export function Statement({
  children,
  tone = 'canvas',
  pad,
  vis = '',
}: {
  children: React.ReactNode
  tone?: 'surface' | 'canvas' | 'ink'
  pad?: string
  vis?: string
}) {
  const isInk = tone === 'ink'
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : isInk ? 'bg-slat' : 'bg-surface'
  return (
    <section className={`${bg} px-6 ${pad ?? 'py-20 sm:py-24'} ${vis}`}>
      <p
        className={`font-display uppercase max-w-3xl mx-auto text-center ${
          isInk ? 'text-on-ink' : 'text-text'
        } text-4xl sm:text-5xl lg:text-6xl leading-[1.1]`}
      >
        {children}
      </p>
    </section>
  )
}

// Alternating image / text row. `reverse` flips the image to the right.
// imgAspect 'natural' shows the whole photo uncropped (good for group shots).
export function ZigZag({
  img,
  alt,
  eyebrow,
  title,
  kicker,
  children,
  cta,
  reverse = false,
  tone = 'surface',
  imgAspect = 'landscape',
  imgPosition = 'center',
  pad,
  vis = '',
}: {
  img: string
  alt: string
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
  children: React.ReactNode
  cta?: { label: string; href: string }
  reverse?: boolean
  tone?: 'surface' | 'canvas' | 'ink'
  imgAspect?: 'square' | 'portrait' | 'landscape' | 'natural'
  imgPosition?: 'top' | 'center' | 'bottom' | 'left' | 'right'
  pad?: string
  vis?: string
}) {
  const isInk = tone === 'ink'
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : isInk ? 'bg-slat' : 'bg-surface'
  const cssAspect =
    imgAspect === 'portrait'
      ? '4/5'
      : imgAspect === 'square'
        ? '1/1'
        : imgAspect === 'natural'
          ? undefined
          : '4/3'
  const objectPos =
    imgPosition === 'top'
      ? 'object-top'
      : imgPosition === 'bottom'
        ? 'object-bottom'
        : imgPosition === 'left'
          ? 'object-left'
          : imgPosition === 'right'
            ? 'object-right'
            : 'object-center'
  // Tall (portrait/square) images get capped width so they don't tower over the
  // text column and leave a big empty gap below the section.
  const wrapMax = imgAspect === 'portrait' || imgAspect === 'square' ? 'max-w-sm mx-auto' : ''
  return (
    <section className={`${bg} px-6 ${pad ?? 'py-20 sm:py-24'} ${vis}`}>
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div
          className={`w-full ${wrapMax} rounded-2xl overflow-hidden border ${
            isInk ? 'border-ink-border shadow-pop' : 'border-border shadow-md'
          } ${reverse ? 'md:order-last' : ''}`}
        >
          <SiteImage
            src={img}
            alt={alt}
            aspect={cssAspect}
            focal={objectPos}
            sizes="(min-width: 768px) 40rem, 100vw"
          />
        </div>
        <div className="max-w-prose">
          {eyebrow && (
            <p
              className={`text-sm font-bold uppercase tracking-[0.25em] mb-4 ${
                isInk ? 'text-primary' : 'text-primary-strong'
              }`}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className={`font-display uppercase text-4xl sm:text-5xl ${
              isInk ? 'text-on-ink' : 'text-text'
            }`}
          >
            {title}
          </h2>
          {kicker && (
            <p
              className={`mt-3 mb-6 text-xl italic ${isInk ? 'text-on-ink-muted' : 'text-muted'}`}
            >
              {kicker}
            </p>
          )}
          <div
            className={`text-lg leading-relaxed space-y-4 ${kicker ? '' : 'mt-6'} ${
              isInk ? 'text-on-ink-muted' : 'text-muted'
            }`}
          >
            {children}
          </div>
          {cta && (
            <Link
              href={cta.href}
              className={`mt-6 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide hover:underline ${
                isInk ? 'text-primary' : 'text-primary-strong'
              }`}
            >
              {cta.label} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

// Pure-CSS marquee strip (see .animate-marquee in globals.css). Items duplicated
// once so the -50% translate loops seamlessly.
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items]
  return (
    <div className="overflow-hidden border-y border-white/10 py-5 select-none">
      <div className="flex w-max animate-marquee items-center whitespace-nowrap">
        {row.map((t, i) => (
          <span key={i} className="flex items-center font-display uppercase text-3xl text-white/15">
            <span className="px-7">{t}</span>
            <span className="text-primary text-xl">&bull;</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// The triptych cross-link. Shows the three brand pillars as a numbered set
// (1 The Lab · 2 The Community · 3 The Quest) with the current page marked, so
// visitors feel the arc and can move Lab → Community → Quest. Place near the
// bottom of each pillar page, above the BetaCTA. Token-only; Server Component.
const PILLARS = [
  { n: '1', label: 'The Lab', href: '/the-lab', tag: 'The place' },
  { n: '2', label: 'The Community', href: '/the-community', tag: 'The people' },
  { n: '3', label: 'The Quest', href: '/the-quest', tag: 'The path' },
] as const

export function PillarNav({
  current,
  tone = 'canvas',
}: {
  current: '/the-lab' | '/the-community' | '/the-quest'
  tone?: 'surface' | 'canvas' | 'ink'
}) {
  const isInk = tone === 'ink'
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : isInk ? 'bg-slat' : 'bg-surface'
  return (
    <section className={`${bg} px-6 py-16 sm:py-20`}>
      <div className="max-w-5xl mx-auto">
        <p
          className={`text-center text-sm font-bold uppercase tracking-[0.25em] mb-8 ${
            isInk ? 'text-primary' : 'text-primary-strong'
          }`}
        >
          The triptych
        </p>
        <ol className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => {
            const active = p.href === current
            return (
              <li key={p.href}>
                {active ? (
                  <div
                    aria-current="page"
                    className={`block h-full rounded-3xl border px-6 py-6 ${
                      isInk
                        ? 'border-primary bg-primary/10'
                        : 'border-primary bg-primary-bg/50'
                    }`}
                  >
                    <PillarFace n={p.n} label={p.label} tag={p.tag} active isInk={isInk} />
                  </div>
                ) : (
                  <Link
                    href={p.href}
                    className={`block h-full rounded-3xl border px-6 py-6 transition-colors ${
                      isInk
                        ? 'border-ink-border hover:border-primary'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <PillarFace n={p.n} label={p.label} tag={p.tag} isInk={isInk} />
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function PillarFace({
  n,
  label,
  tag,
  active = false,
  isInk = false,
}: {
  n: string
  label: string
  tag: string
  active?: boolean
  isInk?: boolean
}) {
  const accent = isInk ? 'text-primary' : 'text-primary-strong'
  const head = active ? accent : isInk ? 'text-on-ink' : 'text-text'
  const sub = isInk ? 'text-on-ink-subtle' : 'text-subtle'
  return (
    <div className="flex items-baseline gap-3">
      <span className={`font-display text-4xl leading-none ${active ? accent : isInk ? 'text-ink-border' : 'text-border-strong'}`}>
        {n}
      </span>
      <div>
        <p className={`font-display uppercase text-2xl leading-none ${head}`}>{label}</p>
        <p className={`mt-1.5 text-xs font-bold uppercase tracking-widest ${active ? accent : sub}`}>
          {active ? 'You are here' : tag}
        </p>
      </div>
    </div>
  )
}

export function BetaCTA({
  heading,
  body,
  pad,
  vis = '',
}: {
  heading: React.ReactNode
  body?: string
  pad?: string
  vis?: string
}) {
  return (
    <section className={`relative bg-slat px-6 ${pad ?? 'py-24 sm:py-28'} text-center overflow-hidden ${vis}`}>
      {/* Warm LED seam at the top edge + amber glow behind the CTA. */}
      <div className="light-strip absolute inset-x-0 top-0" />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div className="relative max-w-2xl mx-auto">
        <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">{heading}</h2>
        {body && <p className="text-xl text-on-ink-muted mb-9 leading-relaxed">{body}</p>}
        <Button href={BETA_CTA_HREF} size="lg">
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </section>
  )
}
