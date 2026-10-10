'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { HouseMenu } from './house-menu'
import type { SiteAdminNavLink } from './site-admin-bar'

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
  links: { label: string; desc?: string | null; href: string }[]
  feature?: { title: string; desc?: string | null; href: string; img?: string | null; pos?: string | null } | null
}

export interface HouseHeaderLink {
  href: string
  label: string
  /** A dropdown in place of a plain link. */
  mega?: SiteMegaMenu | null
  /** An off-site custom link: opens in a new tab. */
  external?: boolean
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
  adminLinks,
  cta,
  logoUrl,
  logoMode,
  skinned,
  fadeOnPause = true,
}: {
  brandName: string
  homeHref: string
  links: HouseHeaderLink[]
  adminLinks: SiteAdminNavLink[] | null
  cta: { href: string; label: string; external: boolean } | null
  logoUrl: string | null
  logoMode: SiteLogoMode
  /** A themed skin (Menswork) draws its own bar: phone menu button, no fade. */
  skinned: boolean
  fadeOnPause?: boolean
}) {
  const [mega, setMega] = useState<string | null>(null)
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
        <a href={homeHref} className="hs-brand" aria-label={showImage ? brandName : undefined}>
          {showPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
            <img src={logoUrl} alt="" className="hs-logo hs-logo-avatar" />
          )}
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
            <img src={logoUrl} alt={brandName} className="hs-logo hs-logo-image" />
          )}
          {skinned && logoUrl && logoMode === 'name' && (
            // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
            <img src={logoUrl} alt="" className="hs-logo" />
          )}
          {!showImage && <span className="hs-brand-name">{brandName}</span>}
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                ) : (
                  <a key={l.href} href={l.href} onMouseEnter={closeMega} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {l.label}
                  </a>
                ),
              )}
              {adminLinks && adminLinks.length > 0 && (
                <span className="hs-nav-admin">
                  <span className="hs-nav-admin-tag">Admin:</span>
                  {adminLinks.map((l, i) => (
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
          {cta && (
            <a
              href={cta.href}
              className="hs-btn hs-btn-dark"
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {cta.label}
            </a>
          )}
          {skinned && (
            <HouseMenu
              label={`${brandName} menu`}
              links={[
                ...links.flatMap((l) => (l.mega ? l.mega.links.map((m) => ({ href: m.href, label: m.label })) : [l])),
                ...(adminLinks ?? []).map((l) => ({ href: l.href, label: `Admin: ${l.label}`, className: 'hs-nav-admin' })),
              ]}
            />
          )}
        </div>
      </div>
      {open?.mega && (
        <div className="hs-mega" id="hs-mega">
          <div className="hs-mega-panel" data-feature={open.mega.feature ? '' : undefined}>
            <div className="hs-mega-links">
              {open.mega.links.map((m) => (
                <a key={`${m.href}:${m.label}`} href={m.href} onClick={closeMega}>
                  <span className="hs-mega-label">{m.label}</span>
                  {m.desc && <span className="hs-mega-desc">{m.desc}</span>}
                </a>
              ))}
            </div>
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
