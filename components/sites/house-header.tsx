'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { HouseMenu } from './house-menu'
import type { SiteAdminNavLink } from './site-admin-bar'
import { useSiteAdmin } from './site-admin-gate'

// THE HOUSE WEBSITE HEADER (header handoff v5, "Daniel Tyack Site v5"). A frosted bar, sticky, 12px from the
// top. Logo slot (name, round photo plus name, or an image logo), a one-line menu that scrolls sideways
// inside its cell with both edges faded, and the Space's own header button. At 940px and up it is one row
// and a pill; under 940px the logo and button share row 1 and the menu takes row 2 (house-css.ts). A menu
// item with `mega` opens a floating panel just under the bar, so the bar never grows: hover opens it on a
// desktop pointer, a click or tap toggles it. After 1.6s without scrolling (past 160px, no panel open, the
// pointer elsewhere) the header fades up and away; a scroll, a hover or the mouse near the top brings it
// back. A client island only for that behaviour: every link and word is the server's, passed in as data.
//
// The Menswork skin keeps its own header: the square bar, the round menu button and its panel under
// 940px (house-menu.tsx), and no fade.

export interface SiteMegaMenu {
  /** `icon` is a skin's own glyph beside the door (the Free Human menu's), drawn by the server. */
  links: { label: string; desc?: string | null; href: string; icon?: ReactNode }[]
  /** A skin's lyric line over the doors (the Free Human menu's). */
  lyric?: string | null
  /** A skin's pictured tiles beside the doors (the Free Human menu's two), in place of the single feature. */
  tiles?: { title: string; kicker?: string | null; href: string; img: string; avg?: string | null }[]
  feature?: { title: string; desc?: string | null; href: string; img?: string | null; pos?: string | null } | null
}

export interface HouseHeaderLink {
  href: string
  label: string
  /** A dropdown in place of a plain link. */
  mega?: SiteMegaMenu | null
  /** An off-site custom link: opens in a new tab. */
  external?: boolean
  /** The page being read, so a skin can mark it (aria-current="page"). Set only by a skin that styles it. */
  current?: boolean
  /** A skin's own glyph beside a plain link (the Free Human Calendar's), drawn by the server. */
  icon?: ReactNode
}

export type SiteLogoMode = 'name' | 'avatar' | 'logo'

const IDLE_MS = 1600
const FADE_AFTER_Y = 160
const WAKE_ZONE_Y = 110
const HOVER_CLICK_MS = 500

export function HouseHeader({
  brandName,
  homeHref,
  links,
  adminLinks: adminLinksIn,
  adminCheck = null,
  cta,
  logoUrl,
  logoMode,
  skinned,
  fadeOnPause = true,
  member = null,
  tools = null,
  brandMark = null,
  menuFoot = null,
  megaChevron = null,
  defaultMega = null,
}: {
  brandName: string
  homeHref: string
  links: HouseHeaderLink[]
  adminLinks: SiteAdminNavLink[] | null
  /** The site's admin check (site-admin-gate.tsx): the admin links show only once it confirms the reader. */
  adminCheck?: string | null
  cta: { href: string; label: string; external: boolean; short?: string } | null
  logoUrl: string | null
  logoMode: SiteLogoMode
  /** A themed skin (Menswork) draws its own bar: phone menu button, no fade. */
  skinned: boolean
  fadeOnPause?: boolean
  /** The reader's own membership in this Space (components/sites/site-member-badge.tsx), beside the
   *  button. An island, so the cached header stays the same for everyone (LIVE-699). */
  member?: ReactNode
  /** A skin's own tools ahead of the button: the Network site's search and account cluster. Islands, so the
   *  cached header stays the same for everyone. */
  tools?: ReactNode
  /** A skin's own drawing of the mark for the logo slot (the Wildheart LogoMark), in place of the logo image
   *  and the name. The server draws it; this island only places it. */
  brandMark?: ReactNode
  /** A skin's lines under the button in the phone menu (the Designer's call, email and hours). */
  menuFoot?: { label: string; href?: string }[] | null
  /** A skin's own chevron after a menu that opens a panel, in place of the house one (the Free Human leaf curve). */
  megaChevron?: ReactNode
  /** The menu whose panel starts open, for a static preview or a render test; a visitor never sets it. */
  defaultMega?: string | null
}) {
  // SCAN-970: the admin links are the Space admin's alone; a visitor never sees them.
  const adminLinks = useSiteAdmin(adminCheck) ? adminLinksIn : null
  const [mega, setMega] = useState<string | null>(defaultMega)
  const [hidden, setHidden] = useState(false)
  const ref = useRef<HTMLElement>(null)
  // Read inside listeners, so they never go stale and never re-subscribe.
  const live = useRef({ mega, hidden, hover: false, hoverOpenedAt: 0 })
  useEffect(() => {
    live.current.mega = mega
    live.current.hidden = hidden
  }, [mega, hidden])

  const fades = fadeOnPause && !skinned
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      if (live.current.hidden) setHidden(false)
      clearTimeout(idle)
      if (!fades) return
      idle = setTimeout(() => {
        if (window.scrollY > FADE_AFTER_Y && !live.current.mega && !live.current.hover) setHidden(true)
      }, IDLE_MS)
    }
    const onMove = (e: MouseEvent) => {
      if (live.current.hidden && e.clientY < WAKE_ZONE_Y) setHidden(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current.mega) setMega(null)
    }
    const onDown = (e: PointerEvent) => {
      if (live.current.mega && ref.current && !ref.current.contains(e.target as Node)) setMega(null)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      clearTimeout(idle)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [fades])

  // Hover opens and closes the panel only on a wide screen with a real pointer; touch toggles by tap.
  const hoverable = () => typeof window !== 'undefined' && window.matchMedia('(min-width:940px) and (hover:hover)').matches
  const closeMega = () => {
    if (live.current.mega) setMega(null)
  }
  const open = links.find((l) => l.mega && l.label === mega) ?? null
  const showPhoto = logoMode === 'avatar' && !!logoUrl
  const showImage = logoMode === 'logo' && !!logoUrl

  return (
    <header
      ref={ref}
      className="hs-header"
      data-hidden={hidden ? '' : undefined}
      onMouseEnter={() => {
        live.current.hover = true
        setHidden(false)
      }}
      onMouseLeave={() => {
        live.current.hover = false
        if (hoverable()) setMega(null)
      }}
    >
      <div className="hs-pill">
        <a href={homeHref} className="hs-brand" aria-label={brandMark ? `${brandName} home` : showImage ? brandName : undefined}>
          {brandMark}
          {!brandMark && showPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
            <img src={logoUrl} alt="" className="hs-logo hs-logo-avatar" />
          )}
          {!brandMark && showImage && (
            // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
            <img src={logoUrl} alt={brandName} className="hs-logo hs-logo-image" />
          )}
          {!brandMark && skinned && logoUrl && logoMode === 'name' && (
            // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
            <img src={logoUrl} alt="" className="hs-logo" />
          )}
          {!brandMark && !showImage && <span className="hs-brand-name">{brandName}</span>}
        </a>
        {(links.length > 0 || (adminLinks?.length ?? 0) > 0) && (
          <nav aria-label={`${brandName} menu`} className="hs-nav">
            <div className="hs-nav-track">
              {links.map((l) =>
                l.mega ? (
                  <button
                    key={l.label}
                    type="button"
                    className="hs-nav-mega"
                    aria-expanded={mega === l.label}
                    aria-controls="hs-mega"
                    onClick={() => {
                      // The click that lands right after hover opened this panel keeps it open.
                      const justHovered = Date.now() - live.current.hoverOpenedAt < HOVER_CLICK_MS
                      setMega((m) => (m === l.label && !justHovered ? null : l.label))
                    }}
                    onMouseEnter={() => {
                      if (!hoverable() || live.current.mega === l.label) return
                      live.current.hoverOpenedAt = Date.now()
                      setMega(l.label)
                    }}
                  >
                    {l.label}
                    {megaChevron ?? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )}
                  </button>
                ) : (
                  <a key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} onMouseEnter={closeMega} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {l.icon}
                    {l.label}
                  </a>
                ),
              )}
              {adminLinks && adminLinks.some((l) => !l.footerOnly) && (
                <span className="hs-nav-admin">
                  <span className="hs-nav-admin-tag">Admin<span className="hs-nav-admin-colon">:</span></span>
                  {adminLinks.filter((l) => !l.footerOnly).map((l, i) => (
                    <Fragment key={l.href}>
                      {i > 0 && <span className="hs-nav-admin-sep" aria-hidden>|</span>}
                      <a href={l.href} aria-current={l.current ? 'page' : undefined} onMouseEnter={closeMega}>
                        {l.label}
                      </a>
                    </Fragment>
                  ))}
                </span>
              )}
            </div>
          </nav>
        )}
        <div className="hs-header-actions">
          {tools}
          {member}
          {cta && (
            <a
              href={cta.href}
              className="hs-btn hs-btn-dark"
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {cta.short ? (
                <>
                  <span className="hs-cta-long">{cta.label}</span>
                  <span className="hs-cta-short" aria-hidden>{cta.short}</span>
                </>
              ) : (
                cta.label
              )}
            </a>
          )}
          {skinned && (
            <HouseMenu
              label={`${brandName} menu`}
              links={[
                ...links.flatMap((l) => (l.mega ? l.mega.links.map((m) => ({ href: m.href, label: m.label, group: l.label })) : [l])),
                ...(adminLinks ?? []).map((l) => ({ href: l.href, label: `Admin: ${l.label}`, className: 'hs-nav-admin' })),
              ]}
              // The header button also rides in the phone menu; only a skin that wants it there shows it (a[data-cta]).
              cta={cta ? { href: cta.href, label: cta.label } : undefined}
              foot={menuFoot ?? undefined}
            />
          )}
        </div>
      </div>
      {open?.mega && (
        <div className="hs-mega" id="hs-mega">
          <div className="hs-mega-panel" data-feature={open.mega.feature ? '' : undefined} data-tiles={open.mega.tiles?.length ? '' : undefined}>
            <div className="hs-mega-links">
              {open.mega.lyric && <p className="hs-mega-lyric">{open.mega.lyric}</p>}
              {open.mega.links.map((m) => (
                <a key={`${m.href}:${m.label}`} href={m.href} onClick={closeMega}>
                  {m.icon}
                  <span className="hs-mega-label">{m.label}</span>
                  {m.desc && <span className="hs-mega-desc">{m.desc}</span>}
                </a>
              ))}
            </div>
            {open.mega.tiles?.length ? (
              <div className="hs-mega-tiles">
                {open.mega.tiles.map((t) => (
                  <a key={`${t.href}:${t.title}`} href={t.href} onClick={closeMega} className="hs-mega-tile">
                    <span className="hs-mega-tile-photo" style={t.avg ? { background: t.avg } : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the kit's own picture under /public */}
                      <img src={t.img} alt="" loading="lazy" decoding="async" />
                    </span>
                    {t.kicker && <span className="hs-mega-tile-kicker">{t.kicker}</span>}
                    <span className="hs-mega-tile-title">{t.title}</span>
                  </a>
                ))}
              </div>
            ) : null}
            {open.mega.feature && (
              <a href={open.mega.feature.href} onClick={closeMega} className="hs-mega-feature">
                {open.mega.feature.img && (
                  // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
                  <img src={open.mega.feature.img} alt="" style={{ objectPosition: open.mega.feature.pos ?? 'center' }} />
                )}
                <span className="hs-mega-feature-shade" aria-hidden />
                <span className="hs-mega-feature-title">{open.mega.feature.title}</span>
                {open.mega.feature.desc && <span className="hs-mega-feature-desc">{open.mega.feature.desc}</span>}
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
