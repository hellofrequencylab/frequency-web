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
import { Reveal } from '@/components/marketing/motion'
import { safeHref } from '@/lib/page-editor/richtext'

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
  facts,
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
  /** The DAWN fact dock: up to three short `[value, label]` figures on a glass panel that
   *  overhangs the hero's bottom edge. Glass earns its cost only over photography, which is
   *  why the dock lives here and nowhere else. The hero tags itself `.mk-hero-dock` so the
   *  next section clears the overhang automatically (globals.css adjacency rule) — no page
   *  has to remember the clearance. */
  facts?: readonly (readonly [string, string])[]
}) {
  const isScreen = minHeight === 'screen'
  // The dock overhangs the section's bottom edge by 2rem, so a hero carrying one must not
  // clip its own children; nothing else in the hero can overflow (every layer is inset-0).
  // `.mk-hero` on BOTH arms, not just the dock arm. It is the tag the globals.css adjacency
  // rule keys on (`.mk-hero:not(.mk-hero-dock) + .mk-beat { padding-top: 0 }`) so a beat right
  // after a hero does not add a second gap on top of the room the hero already carries. Until
  // now a dockless PhotoHero emitted neither class, so that rule had never fired for any hero
  // on the site and eight pages had hand-written the `pt-0` it exists to supply.
  const shape = facts ? 'mk-hero mk-hero-dock' : 'mk-hero overflow-hidden'
  const padY = isScreen
    ? 'py-16 sm:py-28'
    : facts
      ? 'pt-16 sm:pt-32 pb-36 sm:pb-40'
      : 'py-16 sm:py-32'
  return (
    <section
      className={`relative ${shape} ${
        isScreen ? 'min-h-screen flex flex-col items-center justify-center' : ''
      }`}
    >
      <Image src={image} alt={alt} fill preload sizes="100vw" className={`object-cover ${focal}`} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 80%, transparent) 0%, color-mix(in srgb, var(--color-ink) 62%, transparent) 45%, color-mix(in srgb, var(--color-ink) 95%, transparent) 100%)',
        }}
      />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div
        className={`relative z-10 mx-auto px-6 text-center ${
          isScreen ? 'max-w-5xl' : 'max-w-4xl'
        } ${padY}`}
      >
        {eyebrow && (
          <p
            className={`font-bold uppercase tracking-eyebrow text-primary ${
              isScreen ? 'text-body-sm sm:text-body mb-4' : 'text-body-sm mb-5'
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-display uppercase text-on-ink text-balance leading-[0.95] ${
            isScreen ? 'text-[clamp(2.5rem,9vw,6rem)]' : 'text-[clamp(2.25rem,8vw,4.5rem)]'
          }`}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`text-on-ink-muted leading-relaxed mx-auto max-w-2xl ${
              isScreen ? 'mt-5 text-body-lg sm:text-lead' : 'mt-6 text-body sm:text-body-lg'
            }`}
          >
            {subtitle}
          </p>
        )}
        {children && <div className={isScreen ? 'mt-7' : 'mt-9'}>{children}</div>}
        {footer}
      </div>
      {facts && (
        <div className="glass-ink lift-3 absolute -bottom-8 left-1/2 z-20 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-start justify-center gap-6 rounded-2xl px-6 py-4 sm:gap-10 sm:px-9">
          {facts.map(([value, label]) => (
            <div key={label} className="text-center">
              <div className="font-display text-page-title leading-none text-primary sm:text-3xl">
                {value}
              </div>
              <div className="mt-1.5 text-3xs font-bold uppercase tracking-eyebrow text-on-ink-muted">
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
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
    // `mk-hero` is the rhythm tag, not a padding: it carries no padding of its own and exists
    // so the section BELOW knows it follows a hero (globals.css zeroes that section's top
    // padding, since the hero already ends with room). It rides alongside `pad`, which still
    // owns this hero's own padding.
    <section className={`mk-hero px-6 ${pad ?? 'pt-20 pb-12 sm:pt-32 sm:pb-20'} ${vis}`}>
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && (
          <p className="text-body-sm font-bold uppercase tracking-eyebrow text-primary-strong mb-5">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display uppercase text-text text-[clamp(2.25rem,8vw,4.5rem)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-7 text-lead text-muted leading-relaxed max-w-2xl mx-auto">
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
  width = 'prose',
  role,
}: {
  children: React.ReactNode
  tone?: 'surface' | 'canvas' | 'ink'
  className?: string
  pad?: string
  vis?: string
  /** `'prose'` (default) is the reading measure. `'wide'` is for a section whose content is a
   *  comparison table or a multi-column grid that a 3xl measure squeezes into a sideways scroll. */
  width?: 'prose' | 'wide'
  /** Explicit vertical-rhythm role (DAWN four-role system, globals.css). Usually derived:
   *  `band` (loose — a tone change) for tone 'ink', `beat` (the workhorse) otherwise.
   *  `cont` continues the section above at the same tone (no top padding); `cont-soft` is the
   *  half-gap version of that (two nearly-identical tones stacked); `tight` is a short
   *  statement/banner beat. An explicit `pad` still opts out entirely.
   *
   *  `cont-soft` is a ROLE, not a `pad` string. It was reachable only through the escape hatch
   *  until now, which made a deliberate declaration read as an opt-out at the call site. */
  role?: 'band' | 'beat' | 'cont' | 'cont-soft' | 'tight'
}) {
  const bg =
    tone === 'canvas'
      ? 'bg-marketing-canvas'
      : tone === 'ink'
        ? 'bg-slat text-on-ink'
        : 'bg-surface'
  // Default padding rides the DAWN four-role rhythm (`.mk-band/.mk-beat/.mk-cont/.mk-tight`,
  // globals.css) instead of literal py-*: a tone change (ink) takes the loose band beat, a
  // standard section the workhorse beat, and a section FOLLOWED by another gives up a third
  // of its bottom padding so two stacked sections stop double-paying for the shared gap
  // (DAWN 2026-08-03 final round — a value that read right at the end of a page read as a
  // hole in the middle). An explicit `pad` opts out and pays exactly what it asks for.
  const roleClass = `mk-${role ?? (tone === 'ink' ? 'band' : 'beat')}`
  // THE TONE TAG, and why it rides alongside `pad` rather than inside `roleClass`.
  // `.mk-cream` / `.mk-ink` are what make the same-tone-halving rule in globals.css fire: two
  // beats of the same tone in a row give up half the gap between them, while a tone CHANGE
  // keeps the full beat — which is the thing that makes a tone change read as a change. Both
  // classes shipped with ZERO adopters, so the rule had never fired once and the whole
  // four-role rhythm was running on the uncorrected numbers.
  //
  // `Section` is the majority of marketing call sites, so tagging it is the adoption; tagging
  // only the hand-rolled sections would make the correction fire on some seams and not others,
  // which reads as a bug rather than as no rule at all.
  //
  // It is emitted even when `pad` opts out of the ROLE, because tone is not padding: a section
  // that pays its own py-* is still cream or ink to the section under it. The halving rule's
  // `:where(:not(.mk-cont, .mk-cont-soft, .mk-arc))` guard is what keeps a deliberate
  // declaration winning over this inference, so the two cannot collide.
  const toneClass = tone === 'ink' ? 'mk-ink' : 'mk-cream'
  return (
    <section className={`px-6 ${toneClass} ${pad ?? roleClass} ${bg} ${vis} ${className}`}>
      <div className={`${width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto`}>{children}</div>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  kicker,
  tone = 'light',
  align = 'left',
}: {
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
  /** `'ink'` for a heading sitting on a dark band (bg-slat / PhotoBeat). */
  tone?: 'light' | 'ink'
  /** DAWN centers a heading that opens a full-width band; the default stays left. */
  align?: 'left' | 'center'
}) {
  const isInk = tone === 'ink'
  const centered = align === 'center'
  return (
    <div className={`mb-9 ${centered ? 'text-center' : ''}`}>
      {eyebrow && (
        <p
          className={`text-body-sm font-bold uppercase tracking-eyebrow mb-4 ${
            isInk ? 'text-primary' : 'text-primary-strong'
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`font-display uppercase text-[clamp(1.875rem,5.5vw,3rem)] ${
          isInk ? 'text-on-ink' : 'text-text'
        }`}
      >
        {title}
      </h2>
      {kicker && (
        <p
          className={`mt-4 text-body-lg sm:text-lead italic ${isInk ? 'text-on-ink-muted' : 'text-muted'} ${
            centered ? 'mx-auto max-w-2xl' : ''
          }`}
        >
          {kicker}
        </p>
      )}
    </div>
  )
}

// The sub-section heading. SectionHeading is the h2 band that opens a Section; this is the h3 that
// opens ONE BLOCK inside it (a ladder, a comparison table). It exists because three blocks on the
// pricing page had each hand-stacked the same display-h3 + muted kicker pair.
export function BlockHeading({ title, kicker }: { title: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-5">
      <h3 className="font-display uppercase text-text text-page-title">{title}</h3>
      {kicker && <p className="mt-1 text-body-sm leading-relaxed text-muted">{kicker}</p>}
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
    <section className={`${bg} px-6 py-14 sm:py-24`}>
      <figure className="max-w-3xl mx-auto text-center">
        <blockquote
          className={`font-display uppercase text-[clamp(1.75rem,5.5vw,3rem)] leading-[1.08] text-balance ${
            isInk ? 'text-on-ink' : 'text-text'
          }`}
        >
          {children}
        </blockquote>
        {cite && (
          <figcaption
            className={`mt-7 text-body-sm font-bold uppercase tracking-eyebrow ${
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

// Big display stat — RETIRED FROM THIS FILE (2026-08-05), and deliberately not re-exported.
//
// This was the one marketing "variant" that was not a variant. Unlike `Card` and `Button`
// above — which differ from the in-app kit on purpose (editorial scale, the Anton face,
// `shadow-pop`, the warm bands) — the stat exported here was the SAME component as
// `components/ui/stat.tsx` twice: same `<div><p>value</p><p>label</p></div>` anatomy, same
// two tone pairs, same `text-meta font-bold uppercase tracking-eyebrow mt-3` caption. Its
// only real difference was the defect: the numeral was pinned to a literal `text-6xl
// sm:text-7xl` pair, which stops responding the moment a member turns the type scale up,
// while the kit primitive takes the `text-stat` ROLE (--text-stat, scaled by --type-scale).
//
// The three importers (app/page.tsx and the two /discover city hubs) now import `Stat` from
// '@/components/ui/stat' directly. No re-export is left here on purpose: a barrel alias would
// keep two import paths alive for one component, which is how the twin got written in the
// first place. If you reached for a marketing stat and landed on this comment, that is the
// intended outcome — the kit primitive is prop-compatible, `tone="ink"` included.

// The one FAQ disclosure for marketing. Native <details>/<summary> so the
// section stays a Server Component (no client JS), with the ChevronDown rotate
// as the single canonical indicator (retires pricing's `+` and home's copy).
export function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    // rounded-control (was rounded-2xl, the same 1rem at :root): inside a Space subtree the page theme
    // shapes the FAQ card (ADR-578); everywhere else the token resolves exactly as before.
    <details className="group rounded-card border border-border bg-surface px-6 py-5 lift-1 [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-left select-none">
        <span className="text-body-lg font-semibold text-text leading-snug">{q}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4 text-body leading-relaxed text-muted">{children}</div>
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
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-5 py-2.5 text-body-sm gap-1.5',
  md: 'px-8 py-3.5 text-body gap-2',
  lg: 'px-10 py-4 text-body-lg gap-2',
}
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'text-emboss bg-primary text-on-primary hover:bg-primary-hover shadow-pop',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-elevated',
  ghost: 'text-primary-strong hover:underline',
}

/** The button LOOK, without the element. `Button` is always a navigation, but a few marketing
 *  surfaces need the identical chrome on a real `<button>` that fires a server action (the
 *  double-opt-in confirm, the RSVP submit). Those call this instead of re-typing the classes,
 *  which is how the padding/radius drifted the first time. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `inline-flex items-center justify-center rounded-2xl font-bold transition-colors ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`
}

export function Button({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })}>
      {children}
    </Link>
  )
}

// ── The outcome panel: one block for every "this worked / this did not" surface ───────────────
// The confirm, RSVP, and double-opt-in landings each hand-stacked the same lockup (a tinted status
// disc, a display heading, a muted line, one CTA) in five places, and they had already drifted in
// icon size, CTA classes, and vertical rhythm. This is that lockup, once.

type OutcomeTone = 'success' | 'danger' | 'primary' | 'neutral'

const OUTCOME_TONES: Record<OutcomeTone, string> = {
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  primary: 'bg-primary-bg text-primary-strong',
  neutral: 'bg-surface-elevated text-subtle',
}

interface OutcomeProps {
  /** Which status disc to draw. Omit `icon` and no disc renders at all (the pre-action state). */
  tone?: OutcomeTone
  /** A lucide icon component. The panel owns its size and stroke so the disc never drifts. */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: React.ReactNode
  /** `h1` when this IS the page (a confirm landing); `h2` when it replaces a block inside one. */
  as?: 'h1' | 'h2'
  children?: React.ReactNode
  /** The one CTA. A `<Button>`, or a real `<button>` wearing `buttonClasses()`. */
  action?: React.ReactNode
  /** Pass `'status'` when the panel appears in place of a form the visitor just submitted. */
  role?: string
}

/** The panel alone, for a surface that already owns its section (an in-page success state). */
export function OutcomePanel({
  tone = 'neutral',
  icon: Icon,
  title,
  as = 'h1',
  children,
  action,
  role,
}: OutcomeProps) {
  const Heading = as
  return (
    <div role={role} className="text-center">
      {Icon && (
        <div
          aria-hidden
          className={`mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-pill ${OUTCOME_TONES[tone]}`}
        >
          <Icon className="h-7 w-7" strokeWidth={2.5} />
        </div>
      )}
      <Heading
        className={`font-display uppercase text-text ${
          as === 'h1' ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'
        }`}
      >
        {title}
      </Heading>
      {children && <div className="mt-4 text-body-lg leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}

/** The whole page: the panel, centered on the standard single-decision measure. */
export function Outcome(props: OutcomeProps) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-md">
        <OutcomePanel {...props} />
      </div>
    </section>
  )
}

/** The Suspense fallback for an Outcome that has to wait on a round-trip (the confirm landings, the
 *  RSVP capture). DIMENSION-MATCHED to the panel above — same section padding, same measure, same
 *  disc, heading, body, and CTA heights — so the streamed result lands without shifting the page
 *  (PAGE-FRAMEWORK §5.4). Lives beside `Outcome` precisely so the two cannot drift apart. */
export function OutcomeSkeleton() {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-md animate-pulse text-center" aria-hidden>
        <div className="mx-auto mb-6 h-14 w-14 rounded-pill bg-surface-elevated" />
        <div className="mx-auto h-10 w-4/5 rounded-lg bg-surface-elevated sm:h-12" />
        <div className="mt-4 space-y-2">
          <div className="mx-auto h-5 w-full rounded bg-surface-elevated" />
          <div className="mx-auto h-5 w-3/4 rounded bg-surface-elevated" />
        </div>
        <div className="mx-auto mt-8 h-12 w-48 rounded-2xl bg-surface-elevated" />
      </div>
    </section>
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
  tone?: 'soft' | 'feature' | 'elevated' | 'highlight'
  className?: string
}) {
  const tones = {
    soft: 'bg-surface-elevated/60',
    feature: 'border border-border bg-surface lift-1',
    elevated: 'border border-border bg-surface shadow-pop',
    // The one CHOSEN card in a set (the featured plan). A tone rather than a className override, so
    // the border width cannot depend on which utility Tailwind happened to emit last.
    highlight: 'border-2 border-primary bg-surface shadow-pop ring-4 ring-primary-bg',
  } as const
  return <div className={`rounded-2xl p-6 ${tones[tone]} ${className}`}>{children}</div>
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-lead text-text/85 leading-relaxed mb-6">{children}</p>
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
          {/* The numeral is large text, so it needs 3:1. The brand amber gives 2.52:1 on a
              light surface and only clears the bar against ink, so it branches on tone like
              every other coloured element in this kit. It read `text-primary` unconditionally
              while `isInk` sat computed and unused two lines up, which failed on every light
              rendering of Steps at once. */}
          <span
            className={`font-display text-5xl sm:text-6xl leading-none ${
              isInk ? 'text-primary' : 'text-primary-strong'
            }`}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3
            className={`mt-3 font-display uppercase text-page-title ${isInk ? 'text-on-ink' : 'text-text'}`}
          >
            {s.title}
          </h3>
          <p className={`mt-2 text-body leading-relaxed ${isInk ? 'text-on-ink-muted' : 'text-muted'}`}>
            {s.body}
          </p>
        </div>
      ))}
    </div>
  )
}


export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-body-lg text-muted leading-relaxed mb-6">{children}</p>
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
  // A Statement IS the four-role system's `tight` beat — "a statement or a banner: short, so it
  // does not need the full beat" is the role's own definition in globals.css. It had been paying
  // `py-14 sm:py-24` by hand, which is the same shape as the token but frozen at two breakpoints
  // instead of fluid, and invisible to the double-count correction that discounts a section
  // followed by another. The tone tag comes with it for the same reason it does on `Section`.
  return (
    <section className={`${bg} ${isInk ? 'mk-ink' : 'mk-cream'} px-6 ${pad ?? 'mk-tight'} ${vis}`}>
      <p
        className={`font-display uppercase max-w-3xl mx-auto text-center ${
          isInk ? 'text-on-ink' : 'text-text'
        } text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]`}
      >
        {children}
      </p>
    </section>
  )
}

// ── PhotoBeat — a full-bleed photograph carrying one sentence (DAWN) ──────────
// The rhythm alternative to the slat Statement: same job in the page's heartbeat,
// but the picture is the argument. Ink scrim + light-strip seams top and bottom so
// it reads as one printed thing against the cream around it. Accent a phrase in
// `line` with <span className="text-primary">.
export function PhotoBeat({
  image,
  alt = '',
  eyebrow,
  line,
  note,
  focal = 'object-center',
}: {
  image: string
  alt?: string
  eyebrow?: string
  line: React.ReactNode
  note?: React.ReactNode
  focal?: string
}) {
  return (
    <section className="mk-band relative grid min-h-[58vh] place-items-center overflow-hidden">
      <Image src={image} alt={alt} fill sizes="100vw" className={`object-cover ${focal}`} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 82%, transparent), color-mix(in srgb, var(--color-ink) 58%, transparent) 45%, color-mix(in srgb, var(--color-ink) 86%, transparent))',
        }}
      />
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {eyebrow && (
          <p className="text-body-sm font-bold uppercase tracking-eyebrow text-primary">{eyebrow}</p>
        )}
        <p className="mt-4 font-display uppercase text-on-ink text-balance text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05]">
          {line}
        </p>
        {note && (
          <p className="mx-auto mt-5 max-w-2xl text-body-lg leading-relaxed text-on-ink-muted">{note}</p>
        )}
      </div>
      <div className="light-strip absolute inset-x-0 top-0 z-10" />
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
    </section>
  )
}

// ── PhotoTrio — three framed photographs with a caption each (DAWN) ───────────
// The figure row. lift-1, because a figure rests on the page rather than floating
// off it; children reveal in sequence via the positional `.stagger` delays.
export function PhotoTrio({
  items,
}: {
  items: readonly { img: string; alt?: string; title: string; caption: string }[]
}) {
  return (
    <div className="stagger mt-10 grid gap-5 sm:grid-cols-3">
      {items.map((item) => (
        <Reveal
          as="figure"
          key={item.title}
          className="lift-1 overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <SiteImage
            src={item.img}
            alt={item.alt ?? ''}
            aspect="4/3"
            sizes="(min-width: 640px) 22rem, 100vw"
          />
          <figcaption className="p-5">
            <h3 className="text-body font-bold text-text">{item.title}</h3>
            <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{item.caption}</p>
          </figcaption>
        </Reveal>
      ))}
    </div>
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
            isInk ? 'border-ink-border shadow-pop' : 'border-border lift-1'
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
              className={`text-body-sm font-bold uppercase tracking-eyebrow mb-4 ${
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
              className={`mt-3 mb-6 text-lead italic ${isInk ? 'text-on-ink-muted' : 'text-muted'}`}
            >
              {kicker}
            </p>
          )}
          <div
            className={`text-body-lg leading-relaxed space-y-4 ${kicker ? '' : 'mt-6'} ${
              isInk ? 'text-on-ink-muted' : 'text-muted'
            }`}
          >
            {children}
          </div>
          {cta && (
            <Link
              href={safeHref(cta.href) ?? '#'}
              className={`mt-6 inline-flex items-center gap-1.5 text-body-sm font-bold uppercase tracking-wide hover:underline ${
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
    <div className="overflow-hidden border-y border-on-ink/10 py-5 select-none">
      <div className="flex w-max animate-marquee items-center whitespace-nowrap">
        {row.map((t, i) => (
          <span key={i} className="flex items-center font-display uppercase text-3xl text-on-ink/15">
            <span className="px-7">{t}</span>
            <span className="text-primary text-lead">&bull;</span>
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
          className={`text-center text-body-sm font-bold uppercase tracking-eyebrow mb-8 ${
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
        <p className={`font-display uppercase text-page-title leading-none ${head}`}>{label}</p>
        <p className={`mt-1.5 text-meta font-bold uppercase tracking-eyebrow ${active ? accent : sub}`}>
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
    // `mk-band` + `mk-ink`: the close is a tone change, which is the band role's definition, and
    // every marketing page ends here — so this is the single highest-leverage row of the rhythm.
    // The hand-rolled `py-24 sm:py-28` was within a few px of the token at both breakpoints but
    // could not participate in the double-count correction or the same-tone halving above it.
    <section className={`relative bg-slat mk-ink px-6 ${pad ?? 'mk-band'} text-center overflow-hidden ${vis}`}>
      {/* Warm LED seam at the top edge + amber glow behind the CTA. */}
      <div className="light-strip absolute inset-x-0 top-0" />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div className="relative max-w-2xl mx-auto">
        <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">{heading}</h2>
        {body && <p className="text-lead text-on-ink-muted mb-9 leading-relaxed">{body}</p>}
        <Button href={BETA_CTA_HREF} size="lg">
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </section>
  )
}
