import Image from 'next/image'

// PAGE HERO — the ONE canonical header band for the whole site (THEME-PROTOCOL, the "structure" layer).
//
// The single source of truth for the overlay-on-cover header grammar the owner standardized on (the
// Business Spaces / Circles look): a cover image under an ink legibility scrim, with the eyebrow, title,
// subtitle, optional avatar/badges/meta, an optional in-hero search, and the page actions anchored over
// it. EVERY hero-bearing surface renders this component (IndexTemplate's overlay branch, the commerce
// MarketHero, the manager pages), so changing the header look site-wide is a single edit HERE.
//
// TOKENS ONLY (no hardcoded hex): the scrim is `from-ink/*`, text is `text-on-ink` / `text-on-ink-muted`
// (DAWN). This replaces MarketHero's old inline `rgb(20 18 16 / …)` gradient + `text-white`, so commerce
// heroes now theme + dark-mode correctly like everything else.
//
// Presentational + server-friendly (no hooks). Voice-canon copy comes from the caller (no em dashes).

export type PageHeroSize = 'standard' | 'large'
/** `start` = the left-anchored overlay (the standard index + entity grammar). `center` = the centered
 *  commerce hero (Store / Market), kept as a variant of the SAME primitive so both share one scrim,
 *  one token set, and one edit point. */
export type PageHeroAlign = 'start' | 'center'

export interface PageHeroProps {
  /** Cover image URL. `null` renders the neutral gradient placeholder; omit entirely for no cover. */
  coverImage?: string | null
  /** Focal point ("x% y%") from the operator's focal picker, so the crop keeps the subject in frame. */
  coverFocus?: string | null
  /** Small contextual line above the title (on-ink). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** The one-line promise / description under the title (on-ink). */
  subtitle?: React.ReactNode
  /** Optional entity logo/avatar chip (Spaces/Circles), rendered left of the title lockup. */
  avatar?: React.ReactNode
  /** Status / mode chips beside the title. */
  badges?: React.ReactNode
  /** A meta row (counts, location) under the subtitle, on-ink. */
  meta?: React.ReactNode
  /** Primary + secondary actions, anchored bottom-right (start) or centered (center). Secondary buttons
   *  that ride the scrim should use on-ink styles (border-on-ink/30 bg-on-ink/10 text-on-ink). */
  actions?: React.ReactNode
  /** Optional in-hero search bar (the commerce surfaces). */
  search?: React.ReactNode
  /** Band size. `large` is the taller directory hero; `standard` is the uniform index hero. */
  size?: PageHeroSize
  /** Content alignment (see PageHeroAlign). Defaults to `start`. */
  align?: PageHeroAlign
  /** Use the raw <img> element instead of next/image. Needed when the cover is an arbitrary operator URL
   *  on a non-whitelisted host (the IndexTemplate overlay case); next/image only allows configured hosts. */
  rawImg?: boolean
}

const SIZE_MINH: Record<PageHeroSize, string> = {
  standard: 'min-h-[14rem] sm:min-h-[18rem]',
  large: 'min-h-[18rem] sm:min-h-[24rem]',
}
const SIZE_TITLE: Record<PageHeroSize, string> = {
  standard: 'text-2xl sm:text-3xl',
  large: 'text-3xl sm:text-4xl',
}

export function PageHero({
  coverImage,
  coverFocus,
  eyebrow,
  title,
  subtitle,
  avatar,
  badges,
  meta,
  actions,
  search,
  size = 'standard',
  align = 'start',
  rawImg = false,
}: PageHeroProps) {
  const minH = SIZE_MINH[size]
  const centered = align === 'center'
  const focalStyle = coverFocus ? { objectPosition: coverFocus } : undefined

  return (
    <section className={`relative ${minH} overflow-hidden rounded-2xl border border-border`}>
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
      {/* Ink legibility scrim (tokens only). */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent" aria-hidden />

      <div
        className={`relative flex ${minH} flex-col gap-4 p-6 sm:p-8 ${
          centered ? 'items-center justify-center text-center' : 'justify-end sm:flex-row sm:items-end sm:justify-between'
        }`}
      >
        <div className={`flex min-w-0 items-end gap-4 ${centered ? 'flex-col items-center' : ''}`}>
          {avatar && !centered && <div className="shrink-0">{avatar}</div>}
          <div className="min-w-0">
            {eyebrow && (
              <p className={`mb-1.5 text-xs font-semibold uppercase tracking-widest text-on-ink-muted ${centered ? 'sm:mb-3' : ''}`}>
                {eyebrow}
              </p>
            )}
            <div className={`flex flex-wrap items-center gap-2 ${centered ? 'justify-center' : ''}`}>
              <h1 className={`text-balance ${SIZE_TITLE[size]} font-bold text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]`}>
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className={`mt-1 max-w-2xl text-sm font-medium leading-relaxed text-on-ink [text-shadow:0_1px_2px_rgb(0_0_0/0.4)] ${centered ? 'mx-auto' : ''}`}>
                {subtitle}
              </p>
            )}
            {meta && <div className="mt-2 text-sm text-on-ink-muted">{meta}</div>}
            {search && <div className={`mt-4 w-full max-w-lg ${centered ? 'mx-auto' : ''}`}>{search}</div>}
          </div>
        </div>
        {actions && <div className={`flex flex-wrap items-center gap-2 ${centered ? 'justify-center' : 'shrink-0'}`}>{actions}</div>}
      </div>
    </section>
  )
}
