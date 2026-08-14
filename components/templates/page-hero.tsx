import Image from 'next/image'
import { HEADER_MIN_H, type HeaderSize } from '@/lib/layout/header-sizes'
import { HeroAdaptiveText } from './hero-adaptive-text'

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
// FIRST PAINT, stated plainly because it is the part most easily got wrong (ADR-894):
// the SERVER renders every zone UNMEASURED — no `data-media-tone`, no `data-media-plate` — and
// the CSS answers that with the per-glyph halo and NO plate, i.e. the known-good pre-ADR-830
// baseline. It deliberately does not guess: `--color-on-media` defaults to the LIGHT copy, so an
// "unmeasured" state that kept that default and added a plate would still be a tone guess, and on
// a bright cover it composites light-on-light at about 1.13:1 — the exact read the owner
// photographed, wearing a plate. The sensor corrects it on the first frame after hydration, and
// again on any cover / focus / overlay / theme change and on a debounced resize. A caller that
// already KNOWS the answer can skip the correction entirely by passing `initialZoneTones`.
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
  /** A LIVE media node painted in the cover layer instead of a photo: a map, a canvas, a video.
   *  Rendered edge to edge behind the scrim and the lockup, so every other header affordance
   *  (variant, height, overlay, actions) works over it unchanged.
   *
   *  Around You is the first caller (ADR-1032): its header IS the map of what is around you. It
   *  exists because the alternative was a second header grammar for one page, and the thing the
   *  band needed was a different SOURCE of pixels, not a different band.
   *
   *  Wins over `coverImage` when both are set. The node owns its own sizing (`absolute inset-0`
   *  is applied here) and its own interactivity: a decorative backdrop should be inert
   *  (`pointer-events-none` + `aria-hidden`) so it never competes with the copy on top of it. */
  background?: React.ReactNode
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
  /** Does this hero own the page's `<h1>`? Default TRUE, which is right everywhere the hero IS the
   *  page heading. Pass `false` ONLY when an ancestor template already renders the single h1 and
   *  wants the hero as a cover renderer alone (DetailTemplate's standard `coverImage` path).
   *  `minimal` is the only variant that honours this — the other two exist to display the title. */
  heading?: boolean
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
  /** Content-aware overlaid text (ADR-830): drop the text-shadow glow and let a client sensor
   *  sample the cover pixels behind the lockup (factoring the overlay mode/color) to pick light
   *  or dark copy — the on-media token pair — with a subtle token scrim only when even the
   *  better tone misses the readability floor. Wired on the profile header; Space/event heroes
   *  can opt in with this one prop. Default off (the shipped halo treatment).
   *
   *  PER ZONE since ADR-894: with this on, the lockup and the action cluster each carry
   *  `data-hero-zone` and resolve their OWN tone and their OWN plate rung, because one photo can
   *  be dark under the name and bright under the buttons. */
  adaptiveText?: boolean
  /** Accessible name for the on-cover action cluster, so a screen reader announces it as
   *  something other than an unlabelled run of buttons. Sentence case, e.g. "Profile actions". */
  actionsLabel?: string
  /** Server-known tone/plate per zone, stamped straight onto the zone divs so the FIRST paint
   *  is already right instead of flashing a guess. OMIT for "not measured" — which is the honest
   *  default and what every caller passes today (see the first-paint note in the file header).
   *  Read only when `adaptiveText` is on. */
  initialZoneTones?: Partial<Record<HeroZoneName, { tone: 'dark' | 'light'; plate: 0 | 1 | 2 | 3 }>>
}

/** The text zones an adaptive hero resolves independently. `lockup` is the eyebrow + title +
 *  subtitle stack; `actions` is the on-cover control cluster. */
export type HeroZoneName = 'lockup' | 'actions'

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
 *  Journey, Marketplace). Kept byte-for-byte identical to the Space header's `onInkSecondaryClasses`
 *  (app/(main)/spaces/[slug]/(profile)/layout.tsx) so the "look like the button on Spaces" ask holds for
 *  every header button site-wide. Import this for any button placed in a PageHero `actions` slot. */
export const HERO_ACTION_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-on-ink/40 bg-on-ink/10 px-3 py-1.5 text-body-sm font-semibold text-on-ink backdrop-blur-sm transition-colors hover:bg-on-ink/20'

/** The header-action button style for an ADAPTIVE hero (`adaptiveText`). Same geometry as
 *  HERO_ACTION_CLASS, but its border, glass and text colour all derive from the ZONE's
 *  `--color-on-media` via `.hero-chip` in globals.css — so a chip cluster sitting on the bright
 *  half of a cover goes dark while the name on the dark half stays light. HERO_ACTION_CLASS is
 *  fixed on-ink-on-glass and cannot do that, which is why this is a SECOND constant rather than an
 *  edit: seven non-profile heroes depend on that one byte for byte, and a test names it.
 *  Use this for any button in the `actions` slot of a hero with `adaptiveText` on. */
export const HERO_ACTION_CLASS_ADAPTIVE =
  'hero-chip inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-semibold transition-colors'

/** The data attributes that make an element a resolvable text zone. Returns nothing at all when
 *  the hero is not adaptive (so a non-adaptive hero's DOM is byte-identical to before) and, when
 *  it is, emits `data-media-tone` / `data-media-plate` ONLY if the caller supplied a measurement.
 *  An absent attribute is the signal for "unmeasured" that the CSS keys its safe baseline on, so
 *  it must never be filled with a placeholder. */
function zoneProps(
  name: HeroZoneName,
  adaptiveText: boolean,
  initial: PageHeroProps['initialZoneTones'],
): Record<string, string | undefined> {
  if (!adaptiveText) return {}
  const measured = initial?.[name]
  return {
    'data-hero-zone': name,
    'data-media-tone': measured?.tone,
    'data-media-plate': measured ? String(measured.plate) : undefined,
  }
}

export function PageHero({
  coverImage,
  background,
  coverFocus,
  eyebrow,
  title,
  subtitle,
  search,
  actions,
  leading,
  variant = 'overlay',
  heading = true,
  size,
  rawImg = false,
  dimmed = false,
  overlay = true,
  overlayStyle,
  overlayColor,
  adaptiveText = false,
  actionsLabel,
  initialZoneTones,
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
  // Text tone + legibility halo per overlay:
  //  • shadow — light copy on the dark scrim, no halo needed.
  //  • none   — light copy on the raw photo, kept legible by a dark ink halo.
  //  • fade   — the cover melts into the PAGE background, so overlaid copy must contrast with THAT (not be
  //             light-on-light in light mode). Use the theme foreground `text` + a canvas-colored halo
  //             (always the opposite tone to `text`, so it reads in both light and dark mode).
  // ADAPTIVE (ADR-830) replaces all of that: NO halo/glow — the copy renders in the on-media
  // token (flipped light/dark by the HeroAdaptiveText sensor from the pixels + overlay behind
  // it), backed by the .hero-text-scrim gradient only when contrast demands it.
  const fade = oStyle === 'fade'
  const legible = adaptiveText ? '' : oStyle === 'shadow' ? '' : fade ? ' on-fade-text' : ' on-image-text'
  const titleTone = adaptiveText ? 'text-on-media' : fade ? 'text-text' : 'text-on-ink'
  const subtitleTone = adaptiveText ? 'text-on-media/85' : fade ? 'text-text/80' : 'text-on-ink/85'

  return (
    <section className={`relative overflow-hidden rounded-3xl border border-border${adaptiveText ? ' hero-adaptive-text' : ''}`}>
      {/* Cover: a LIVE media node, a real photo, or the neutral gradient placeholder when
          null/absent. The three are one layer, so the scrim, the glow and the lockup below sit on
          whichever of them rendered and none of them has to know which it was. */}
      {background ? (
        <div className="absolute inset-0">{background}</div>
      ) : coverImage ? (
        rawImg ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary operator host, next/image can't allowlist it
          <img src={coverImage} alt="" data-hero-cover="" fetchPriority="high" style={focalStyle} className={`absolute inset-0 h-full w-full object-cover${dim}`} />
        ) : (
          // `data-hero-cover` is how the sensor finds THE COVER rather than "the first image in
          // the section". With no cover this branch does not render at all and the `leading`
          // slot's avatar becomes the only <img> here, so a bare querySelector('img') would
          // resolve the header's tone from the member's own face.
          <Image src={coverImage} alt="" fill sizes="100vw" preload data-hero-cover="" style={focalStyle} className={`object-cover${dim}`} />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg" aria-hidden />
      )}
      {/* The overlay (tokens only): a colorable shadow/fade scrim; the amber glow rides the shadow style. */}
      {scrimBg && <div className="absolute inset-0" style={{ background: scrimBg }} aria-hidden />}
      {oStyle === 'shadow' && <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />}
      {/* Adaptive text (ADR-830): the readability scrim (token gradient, faded in only when the
          sensor asks) + the invisible sensor that stamps data-media-tone / data-media-scrim. */}
      {adaptiveText && <div className="hero-text-scrim" aria-hidden />}
      {adaptiveText && (
        <HeroAdaptiveText
          coverImage={coverImage ?? null}
          coverFocus={coverFocus ?? null}
          overlayStyle={oStyle}
          overlayColor={overlayColor ?? null}
        />
      )}

      {variant === 'minimal' ? (
        // Cover + scrim only. Normally the page still needs its heading, so an sr-only h1 carries it
        // (a11y + SEO) — PageHero IS the page heading on those surfaces.
        //
        // ⚠️ `heading={false}` is for the one case where it is NOT: a template that owns the page's
        // single <h1> in its own band and wants this component purely as a cover renderer. Emitting
        // the sr-only h1 there ships TWO h1s with the same text, which is why DetailTemplate could
        // not use PageHero for its standard cover and every operator cover control (height, focal
        // point, overlay) was unreachable on Detail pages.
        <div className={`relative z-10 ${HEADER_MIN_H[resolvedSize]}`}>
          {heading ? <h1 className="sr-only">{title}</h1> : null}
        </div>
      ) : variant === 'identity' ? (
        // Entity header: the lockup anchored bottom-left, an optional leading chip beside the title.
        // PHONE PADDING (< sm only): 20px instead of 24px. It buys the action cluster ~9px of
        // usable width and gives the band ~17px of height back, which is what lets the cluster
        // wrap inside the 15rem min-height instead of growing the cover. The `sm:` pair below is
        // untouched, so from 640px up this element's padding is byte-identical to before.
        <div className={`relative z-10 flex ${HEADER_MIN_H[resolvedSize]} flex-col justify-end px-5 py-5 sm:px-8 sm:py-8${legible}`}>
          {/* Space-page parity: the leading avatar/icon + identity anchored bottom-LEFT, the actions
              bottom-RIGHT, both over the cover. Stats/meta live BELOW in the DetailTemplate band. */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 items-end gap-3">
              {/* The avatar sits OUTSIDE the lockup zone on purpose. A rounded plate painted
                  behind an 80px circle is a visible artefact, and the avatar's own pixels are not
                  behind any glyph — including them would drag the statistic toward a face. */}
              {leading && <span className="shrink-0">{leading}</span>}
              <div className={`min-w-0${adaptiveText ? ' hero-zone' : ''}`} {...zoneProps('lockup', adaptiveText, initialZoneTones)}>
                {eyebrow && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-meta font-bold uppercase tracking-eyebrow text-primary sm:text-body-sm">{eyebrow}</div>
                )}
                <h1 className={`font-display uppercase leading-[1] text-balance ${titleTone} text-[clamp(1.25rem,3vw,2rem)] break-words`}>
                  {title}
                </h1>
                {subtitle && (
                  <div className={`mt-1.5 max-w-xl text-body-sm leading-relaxed ${subtitleTone}`}>{subtitle}</div>
                )}
              </div>
            </div>
            {/* Actions ALWAYS right-aligned: `ml-auto` pushes the cluster to the right of the row, and when
                the row wraps (narrow), the cluster lands alone on its line and `ml-auto` keeps it right —
                never left/centered. `justify-end` right-aligns the buttons within the cluster too.
                It is its OWN zone: on a split cover the chips routinely sit on the opposite half
                from the name and need the opposite tone.

                🔴 `max-sm:w-full` is a BUG FIX, not a style tweak (2026-07-28). `shrink-0` on a
                wrapping flex container pins its flex base size to MAX-CONTENT — every chip on one
                line — and forbids it shrinking to the line it landed on. On a phone that is ~500px
                of chips (a friend viewer) inside a ~245px box, and the section's own
                `overflow-hidden` PAINTED THE OVERFLOW OFF THE PAGE: Message, Tip and the staff
                Settings drawer were rendered outside the clip and unreachable by touch. No
                horizontal scrollbar ever appeared to signal it, because the shell root carries
                `overflow-x-clip`. Giving the cluster an explicit 100% width below `sm` forces it
                onto its own flex line at exactly the container width, so `flex-wrap` finally has a
                line box to wrap INSIDE. From 640px up there is still no width declaration at all,
                so the computed style is identical to before. */}
            {actions && (
              <div
                role={adaptiveText ? 'group' : undefined}
                aria-label={adaptiveText ? (actionsLabel ?? 'Header actions') : undefined}
                className={`ml-auto flex max-sm:w-full shrink-0 flex-wrap items-center justify-end gap-2${adaptiveText ? ' hero-zone' : ''}`}
                {...zoneProps('actions', adaptiveText, initialZoneTones)}
              >
                {actions}
              </div>
            )}
          </div>
        </div>
      ) : (
        // Overlay (default): centered content, fixed min-height so every hero is the same size.
        <div className={`relative z-10 mx-auto flex ${HEADER_MIN_H[resolvedSize]} max-w-3xl flex-col items-center justify-center px-6 py-8 text-center sm:py-12${legible}`}>
          {/* This branch is NOT reachable only by the directory heroes. A surface that passes
              `variant={header.layout}` hands the choice to the operator, and an operator flipping
              /admin/elements to `overlay` lands the adaptive profile header right here. So the
              centered lockup and its actions carry zones too; an adaptive branch with no zone
              would render `text-on-media` that nothing ever resolves. */}
          <div className={adaptiveText ? 'hero-zone' : undefined} {...zoneProps('lockup', adaptiveText, initialZoneTones)}>
            {eyebrow && (
              <p className="mb-3 text-body-sm font-bold uppercase tracking-eyebrow text-primary sm:mb-4">{eyebrow}</p>
            )}
            <h1 className={`font-display uppercase leading-[0.95] text-balance ${titleTone} text-[clamp(1.75rem,6vw,3.75rem)]`}>
              {title}
            </h1>
            {subtitle && (
              <p className={`mx-auto mt-3 max-w-2xl text-body leading-relaxed ${adaptiveText ? 'text-on-media/85' : fade ? 'text-text/80' : 'text-on-ink/80'} sm:mt-5 sm:text-body-lg`}>{subtitle}</p>
            )}
          </div>
          {search && <div className="mt-4 w-full max-w-lg sm:mt-6">{search}</div>}
          {actions && (
            <div
              role={adaptiveText ? 'group' : undefined}
              aria-label={adaptiveText ? (actionsLabel ?? 'Header actions') : undefined}
              className={`mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3${adaptiveText ? ' hero-zone' : ''}`}
              {...zoneProps('actions', adaptiveText, initialZoneTones)}
            >
              {actions}
            </div>
          )}
        </div>
      )}
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" aria-hidden />
    </section>
  )
}
