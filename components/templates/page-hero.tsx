import Image from 'next/image'

// PAGE HERO — the ONE canonical header band for the whole site (THEME-PROTOCOL, the "structure" layer).
//
// This IS the Business Spaces / Circles hero the owner standardized on: a full-bleed cover under a dark
// ink gradient + the amber glow, a bold uppercase font-display title, an eyebrow, a subtitle, an optional
// in-hero search, optional actions, capped by the light strip. Centered, fixed min-height so every hero
// reads the same regardless of copy. EVERY hero-bearing surface renders this (IndexTemplate's overlay
// branch, the commerce MarketHero, the manager pages), so the header look is a single edit HERE.
//
// TOKENS ONLY (no hardcoded hex): the scrim is a `var(--color-ink)` color-mix, the eyebrow is
// `text-primary`, the title/subtitle are `text-on-ink`. `amber-glow` / `light-strip` / `font-display`
// are house utilities from globals.css. Presentational + server-friendly (no hooks). Voice-canon copy
// comes from the caller (no em dashes).

export type PageHeroSize = 'standard' | 'large'

export interface PageHeroProps {
  /** Cover image URL. `null` renders the neutral gradient placeholder; omit entirely for no cover. */
  coverImage?: string | null
  /** Focal point ("x% y%") from the operator's focal picker, so the crop keeps the subject in frame. */
  coverFocus?: string | null
  /** Small contextual line above the title (uppercase, accent). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** The one-line promise / description under the title. */
  subtitle?: React.ReactNode
  /** Optional in-hero search bar (the commerce + directory surfaces). */
  search?: React.ReactNode
  /** Primary + secondary actions, centered under the title. Secondary buttons that ride the scrim should
   *  use on-ink styles (border-on-ink/30 bg-on-ink/10 text-on-ink). */
  actions?: React.ReactNode
  /** Band size. `large` is the taller directory hero; `standard` is the shorter one. */
  size?: PageHeroSize
  /** Use the raw <img> element instead of next/image — needed when the cover is an arbitrary operator URL
   *  on a non-whitelisted host (the IndexTemplate overlay case); next/image only allows configured hosts. */
  rawImg?: boolean
}

const SIZE_MINH: Record<PageHeroSize, string> = {
  standard: 'min-h-[15rem] sm:min-h-[20rem]',
  large: 'min-h-[15rem] sm:min-h-[24rem]',
}

// The ink scrim, faithful to the original MarketHero (darker top + bottom, lighter middle), token-clean:
// `var(--color-ink)` via color-mix so it themes + dark-modes instead of a hardcoded rgb().
const SCRIM =
  'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 80%, transparent) 0%, color-mix(in srgb, var(--color-ink) 55%, transparent) 45%, color-mix(in srgb, var(--color-ink) 92%, transparent) 100%)'

export function PageHero({
  coverImage,
  coverFocus,
  eyebrow,
  title,
  subtitle,
  search,
  actions,
  size = 'large',
  rawImg = false,
}: PageHeroProps) {
  const focalStyle = coverFocus ? { objectPosition: coverFocus } : undefined
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border">
      {/* Cover: a real photo, or the neutral gradient placeholder when null/absent. */}
      {coverImage ? (
        rawImg ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary operator host, next/image can't allowlist it
          <img src={coverImage} alt="" fetchPriority="high" style={focalStyle} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Image src={coverImage} alt="" fill sizes="100vw" preload style={focalStyle} className="object-cover" />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg" aria-hidden />
      )}
      {/* Ink scrim (tokens only) + the house amber glow. */}
      <div className="absolute inset-0" style={{ background: SCRIM }} aria-hidden />
      <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />

      {/* Centered content, fixed min-height so every hero is the same size no matter the copy. */}
      <div className={`relative z-10 mx-auto flex ${SIZE_MINH[size]} max-w-3xl flex-col items-center justify-center px-6 py-8 text-center sm:py-12`}>
        {eyebrow && (
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-primary sm:mb-4">{eyebrow}</p>
        )}
        <h1 className="font-display uppercase leading-[0.95] text-balance text-on-ink text-[clamp(1.75rem,6vw,3.75rem)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-on-ink/80 sm:mt-5 sm:text-lg">{subtitle}</p>
        )}
        {search && <div className="mt-4 w-full max-w-lg sm:mt-6">{search}</div>}
        {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3">{actions}</div>}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" aria-hidden />
    </section>
  )
}
