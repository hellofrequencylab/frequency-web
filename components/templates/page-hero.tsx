import Image from 'next/image'
import { HEADER_MIN_H, type HeaderSize } from '@/lib/layout/header-sizes'

// PAGE HERO — the ONE canonical header band for the whole site (THEME-PROTOCOL, the "structure" layer),
// and the render side of the `header` embeddable element (docs/EMBEDDABLE-ELEMENTS.md, ADR-792). ONE
// component, a few LAYOUT VARIANTS, the SAME editing inputs (cover · focal point · height · overlay ·
// eyebrow/title/subtitle · actions) everywhere:
//
//   • overlay  — the Business Spaces / Circles / Marketplace hero: content CENTERED on the ink scrim.
//                The shipped default; every existing caller keeps this exact look.
//   • identity — an entity header: the same cover + scrim, but the lockup is anchored BOTTOM-LEFT with an
//                optional leading chip (a Journey icon, a profile avatar). This is the "liked" immersive
//                header for Journeys and personal profiles (they used to fall back to a plain band).
//   • minimal  — cover + scrim only (no overlaid copy), for surfaces that genuinely want a quiet band.
//
// TOKENS ONLY (no hardcoded hex): the scrim is a `var(--color-ink)` color-mix, the eyebrow is
// `text-primary`, the title/subtitle are `text-on-ink`. `amber-glow` / `light-strip` / `font-display`
// are house utilities from globals.css. Presentational + server-friendly (no hooks), so it renders in a
// Server Component (the h1 stays server-rendered for SEO). Voice-canon copy comes from the caller.

export type PageHeroSize = HeaderSize
export type PageHeroVariant = 'overlay' | 'identity' | 'minimal'

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
  /** Optional in-hero search bar (the commerce + directory surfaces). Overlay variant only. */
  search?: React.ReactNode
  /** Primary + secondary actions. Secondary buttons that ride the scrim should use on-ink styles
   *  (border-on-ink/30 bg-on-ink/10 text-on-ink). */
  actions?: React.ReactNode
  /** A leading chip beside the title in the `identity` variant: an entity icon or an avatar. Ignored by
   *  the other variants. */
  leading?: React.ReactNode
  /** The layout variant (see the file header). Defaults to the shipped centered `overlay`. */
  variant?: PageHeroVariant
  /** Band height. `large` is the taller directory hero; `standard` the shorter one; `short` / `tall`
   *  extend the ladder for entity headers. */
  size?: PageHeroSize
  /** Use the raw <img> element instead of next/image — needed when the cover is an arbitrary operator URL
   *  on a non-whitelisted host (the IndexTemplate overlay case); next/image only allows configured hosts. */
  rawImg?: boolean
  /** Desaturate the cover (demo/seeded surfaces read as not-quite-real, e.g. demo profiles). */
  dimmed?: boolean
  /** Draw the ink overlay (scrim + amber glow) over the cover. Default on. Off = the clean image shows
   *  through, with a token text-shadow keeping the overlaid copy legible. */
  overlay?: boolean
}

// The ink scrim, faithful to the original MarketHero (darker top + bottom, lighter middle), token-clean:
// `var(--color-ink)` via color-mix so it themes + dark-modes instead of a hardcoded rgb().
const SCRIM =
  'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 80%, transparent) 0%, color-mix(in srgb, var(--color-ink) 55%, transparent) 45%, color-mix(in srgb, var(--color-ink) 92%, transparent) 100%)'
// The identity variant anchors its lockup at the bottom, so it wants a heavier FOOT on the scrim (the
// copy sits over the darkest region) and a lighter head. Same token, different stops.
const SCRIM_IDENTITY =
  'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 45%, transparent) 0%, color-mix(in srgb, var(--color-ink) 55%, transparent) 45%, color-mix(in srgb, var(--color-ink) 92%, transparent) 100%)'

export function PageHero({
  coverImage,
  coverFocus,
  eyebrow,
  title,
  subtitle,
  search,
  actions,
  leading,
  variant = 'overlay',
  size,
  rawImg = false,
  dimmed = false,
  overlay = true,
}: PageHeroProps) {
  const focalStyle = coverFocus ? { objectPosition: coverFocus } : undefined
  const dim = dimmed ? ' dimmed' : ''
  // Sensible default height per variant (identity headers read best a touch shorter than the big
  // directory hero); an explicit `size` always wins.
  const resolvedSize: PageHeroSize = size ?? (variant === 'identity' ? 'standard' : variant === 'minimal' ? 'short' : 'large')
  const scrim = variant === 'identity' ? SCRIM_IDENTITY : SCRIM
  // With the overlay off, keep overlaid copy legible over a bright photo via a token text-shadow.
  const legible = overlay ? '' : ' on-image-text'

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border">
      {/* Cover: a real photo, or the neutral gradient placeholder when null/absent. */}
      {coverImage ? (
        rawImg ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary operator host, next/image can't allowlist it
          <img src={coverImage} alt="" fetchPriority="high" style={focalStyle} className={`absolute inset-0 h-full w-full object-cover${dim}`} />
        ) : (
          <Image src={coverImage} alt="" fill sizes="100vw" preload style={focalStyle} className={`object-cover${dim}`} />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg" aria-hidden />
      )}
      {/* Ink scrim (tokens only) + the house amber glow — the "overlay". Off = the clean image shows. */}
      {overlay && (
        <>
          <div className="absolute inset-0" style={{ background: scrim }} aria-hidden />
          <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />
        </>
      )}

      {variant === 'minimal' ? (
        // Cover + scrim only. The page still needs its heading, so keep an sr-only h1 (a11y + SEO).
        <div className={`relative z-10 ${HEADER_MIN_H[resolvedSize]}`}>
          <h1 className="sr-only">{title}</h1>
        </div>
      ) : variant === 'identity' ? (
        // Entity header: the lockup anchored bottom-left, an optional leading chip beside the title.
        <div className={`relative z-10 flex ${HEADER_MIN_H[resolvedSize]} flex-col justify-end px-5 py-5 sm:px-8 sm:py-7${legible}`}>
          {/* Space-page parity: the leading avatar/icon + identity anchored bottom-LEFT, the actions
              bottom-RIGHT, both over the cover. Stats/meta live BELOW in the DetailTemplate band. */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 items-end gap-3">
              {leading && <span className="shrink-0">{leading}</span>}
              <div className="min-w-0">
                {eyebrow && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary sm:text-sm">{eyebrow}</div>
                )}
                <h1 className="font-display uppercase leading-[1] text-balance text-on-ink text-[clamp(1.25rem,3vw,2rem)] break-words">
                  {title}
                </h1>
                {subtitle && (
                  <div className="mt-1.5 max-w-xl text-sm leading-relaxed text-on-ink/85">{subtitle}</div>
                )}
              </div>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>
      ) : (
        // Overlay (default): centered content, fixed min-height so every hero is the same size.
        <div className={`relative z-10 mx-auto flex ${HEADER_MIN_H[resolvedSize]} max-w-3xl flex-col items-center justify-center px-6 py-8 text-center sm:py-12${legible}`}>
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
      )}
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" aria-hidden />
    </section>
  )
}
