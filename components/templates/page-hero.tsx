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
export type HeroOverlayStyle = 'none' | 'shadow' | 'fade'

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
  /** @deprecated use `overlayStyle`. Back-compat: true → 'shadow', false → 'none'. */
  overlay?: boolean
  /** The overlay treatment over the cover (unified across every header):
   *   • 'shadow' (default) — a full ink scrim + the house amber glow (today's look).
   *   • 'none'   — the clean image, overlaid copy kept legible by a token text-shadow.
   *   • 'fade'   — a color faded UP from the bottom (blends the cover into the page). */
  overlayStyle?: HeroOverlayStyle
  /** CSS color for the shadow/fade overlay (from the editor's color picker). Defaults: shadow →
   *  var(--color-ink); fade → var(--color-canvas) (the page background). */
  overlayColor?: string
}

// The overlay gradients, parameterized by color (tokens by default) so they theme + dark-mode. `shadow`
// is the darker-top/bottom scrim (identity variant lightens the top so the bottom lockup reads); `fade`
// pulls the color up from the bottom only, melting the cover into the page.
function shadowScrim(color: string, identity: boolean): string {
  const top = identity ? 45 : 80
  return `linear-gradient(180deg, color-mix(in srgb, ${color} ${top}%, transparent) 0%, color-mix(in srgb, ${color} 55%, transparent) 45%, color-mix(in srgb, ${color} 92%, transparent) 100%)`
}
function fadeScrim(color: string): string {
  return `linear-gradient(180deg, transparent 0%, transparent 38%, color-mix(in srgb, ${color} 88%, transparent) 100%)`
}

/** The ONE header-action button style — on-ink, glassy — so every header's buttons match (Space, Profile,
 *  Journey, Marketplace). Import this for any button placed in a PageHero `actions` slot. */
export const HERO_ACTION_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-on-ink/30 bg-on-ink/10 px-3 py-1.5 text-sm font-medium text-on-ink backdrop-blur transition-colors hover:bg-on-ink/20'

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
  overlayStyle,
  overlayColor,
}: PageHeroProps) {
  const focalStyle = coverFocus ? { objectPosition: coverFocus } : undefined
  const dim = dimmed ? ' dimmed' : ''
  // Sensible default height per variant (identity headers read best a touch shorter than the big
  // directory hero); an explicit `size` always wins.
  const resolvedSize: PageHeroSize = size ?? (variant === 'identity' ? 'standard' : variant === 'minimal' ? 'short' : 'large')
  // Resolve the overlay: explicit overlayStyle wins; else map the legacy `overlay` boolean.
  const oStyle: HeroOverlayStyle = overlayStyle ?? (overlay === false ? 'none' : 'shadow')
  const scrimBg =
    oStyle === 'shadow'
      ? shadowScrim(overlayColor || 'var(--color-ink)', variant === 'identity')
      : oStyle === 'fade'
        ? fadeScrim(overlayColor || 'var(--color-canvas)')
        : null
  // Without a full shadow scrim, keep overlaid copy legible over the photo via a token text-shadow.
  const legible = oStyle === 'shadow' ? '' : ' on-image-text'

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
      {/* The overlay (tokens only): a colorable shadow/fade scrim; the amber glow rides the shadow style. */}
      {scrimBg && <div className="absolute inset-0" style={{ background: scrimBg }} aria-hidden />}
      {oStyle === 'shadow' && <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />}

      {variant === 'minimal' ? (
        // Cover + scrim only. The page still needs its heading, so keep an sr-only h1 (a11y + SEO).
        <div className={`relative z-10 ${HEADER_MIN_H[resolvedSize]}`}>
          <h1 className="sr-only">{title}</h1>
        </div>
      ) : variant === 'identity' ? (
        // Entity header: the lockup anchored bottom-left, an optional leading chip beside the title.
        <div className={`relative z-10 flex ${HEADER_MIN_H[resolvedSize]} flex-col justify-end px-6 py-6 sm:px-8 sm:py-8${legible}`}>
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
