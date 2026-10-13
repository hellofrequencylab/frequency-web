'use client'

// THE FREQUENCY PUBLIC HEADER (header v4): templates/website/web/megamenu.js, ported to React with the
// kit's class names verbatim (app/themes/frequency/kit-site.css). Data: lib/frequency/site-nav.ts.
//
//   Left   logo (home), then For people · For spaces · Features (menus) and Pricing · Stories (links).
//   Right  search, Log in and the page's primary action; signed in, search and "Your feed".
//   Menus  open on hover (fine pointers, 180ms intent, 60ms when one is already open, 280ms forgiving
//          close) or click; ArrowDown opens and focuses the first link; Escape closes and returns focus.
//   Search "/" or the icon; substring over pages and every feature; Enter goes to the first hit.
//   Scroll shrinks after 24px, hides on the way down past 240px, returns on the way up, and draws the
//          iridescent progress line.
//   <1024px the full-screen Menu sheet: search and login first, then the wings as accordions.
//
// What the prototype fakes and this does not: its account menu (Maya, Zaps, role tabs, notifications)
// is sample data behind a localStorage switch. Here "signed in" is the real Supabase session, read
// lazily after paint (no request read, so every page stays static), and it shows one door: Your feed.

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { useSite } from '@/components/frequency/site/shell/site-root'
import {
  DIRECT_LINKS,
  FEATURE_JOURNEYS,
  FEATURES_LABEL,
  ROUTES,
  SIDE_CTA,
  WING_MENUS,
  featureHref,
  featuresWingHref,
  searchSite,
  type MegaCard,
  type SiteLink,
  type Wing,
} from '@/lib/frequency/site-nav'

type MenuKey = Wing | 'packages'

const WORDMARK = '/brand/frequency/frequency-wordmark.png'
const PANEL_ID = 'fq-mm-panel'

// ── An overlay that fades: mounted → on (next frames) → off → unmounted (after `ms`). It belongs to the
// path it opened on, so a navigation closes it without an effect. ───────────────────────────────────
type Phase = 'closed' | 'opening' | 'open' | 'closing'

function useOverlay(ms: number, pathname: string) {
  const [s, setS] = useState<{ phase: Phase; path: string }>({ phase: 'closed', path: pathname })
  const live = s.path === pathname && s.phase !== 'closed'
  const show = useCallback(() => {
    setS({ phase: 'opening', path: pathname })
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setS((c) => (c.phase === 'opening' ? { ...c, phase: 'open' } : c))),
    )
  }, [pathname])
  const hide = useCallback(() => {
    setS((c) => (c.phase === 'closed' ? c : { ...c, phase: 'closing' }))
    setTimeout(() => setS((c) => (c.phase === 'closing' ? { ...c, phase: 'closed' } : c)), ms)
  }, [ms])
  const isOpen = live && (s.phase === 'opening' || s.phase === 'open')
  return { mounted: live, on: live && s.phase === 'open', isOpen, show, hide }
}

// ── Pieces ─────────────────────────────────────────────────────────────────────────────────────────

const Chev = () => (
  <svg className="mm-chev" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

function MmLink({ link }: { link: SiteLink }) {
  if (!link.href) return null
  return (
    <Link className="mm-link" href={link.href}>
      <i className="mm-ic">{link.icon && <FqIcon name={link.icon} />}</i>
      <span>
        <b>{link.label}</b>
        {link.hint && <small>{link.hint}</small>}
      </span>
    </Link>
  )
}

function MmCard({ card }: { card: MegaCard }) {
  return (
    <Link className="mm-card" href={card.href}>
      <span className="mm-img" style={{ backgroundImage: `url('${card.photo}')` }} />
      <span className="mm-shade" />
      <span className="mm-ct">
        <span className="mm-k">{card.kicker}</span>
        <b>{card.title}</b>
      </span>
      <span className="fq-grain" aria-hidden="true" />
    </Link>
  )
}

function FeaturesPanel() {
  return (
    <>
      <div className="mm-fx">
        {FEATURE_JOURNEYS.map((s) => (
          <div className="mm-fxs" data-wing={s.side === 'e' ? 'spaces' : 'community'} key={s.side}>
            <Link className="mm-fxh" href={featuresWingHref(s.side)}>
              {s.label} →
            </Link>
            <div className="mm-fxrow">
              {s.jobs.map((j) => (
                <div className="mm-fxj" key={j.job}>
                  <span className="mm-h">{j.job}</span>
                  <div className="mm-pkf">
                    {j.features.map((f) => (
                      <Link key={f.id} href={featureHref(f.id)}>
                        {f.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mm-foot">
        <span>Open any feature to see how it works.</span>
        {ROUTES.features && (
          <Link className="btn fq-iri-btn" href={ROUTES.features}>
            All features →
          </Link>
        )}
      </div>
    </>
  )
}

function WingPanel({ wing }: { wing: Wing }) {
  const m = WING_MENUS.find((x) => x.key === wing)!
  return (
    <>
      <div className="mm-grid" data-wing={wing === 'people' ? 'community' : 'spaces'}>
        {m.cols.map((c) => (
          <div className="mm-col" key={c.heading}>
            <span className="mm-h">{c.heading}</span>
            {c.links.map((l) => (
              <MmLink link={l} key={l.label} />
            ))}
          </div>
        ))}
        <div className="mm-cards">
          {m.cards.map((c) => (
            <MmCard card={c} key={c.title} />
          ))}
        </div>
      </div>
      <div className="mm-foot">
        <span>{m.foot.line}</span>
        {m.foot.cta.href && (
          <Link className="btn fq-iri-btn" href={m.foot.cta.href}>
            {m.foot.cta.label} →
          </Link>
        )}
      </div>
    </>
  )
}

function wingOf(pathname: string): MenuKey | null {
  const under = (r: string | null) => !!r && (pathname === r || pathname.startsWith(`${r}/`))
  if (under(ROUTES.people)) return 'people'
  if (under(ROUTES.spaces)) return 'spaces'
  if (under(ROUTES.features)) return 'packages'
  return null
}

// ── The header ─────────────────────────────────────────────────────────────────────────────────────

export function SiteHeader() {
  const { page, side } = useSite()
  const pathname = usePathname() || '/'
  const router = useRouter()
  const here = wingOf(pathname)

  const navRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const menu = useOverlay(220, pathname)
  const search = useOverlay(180, pathname)
  const sheet = useOverlay(220, pathname)
  const [menuKey, setMenuKey] = useState<MenuKey>('people')
  const [query, setQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [viewer, setViewer] = useState<{ initial: string } | null>(null)

  const open = menu.isOpen ? menuKey : null
  const showMenu = useCallback(
    (k: MenuKey) => {
      setMenuKey(k)
      setHidden(false)
      if (!menu.isOpen) menu.show()
    },
    [menu],
  )
  const hideMenu = menu.hide

  const openSearch = useCallback(() => {
    hideMenu()
    setQuery('')
    search.show()
  }, [hideMenu, search, setQuery])

  // Signed-in state, read after paint from the local session (no network, no request read). The client
  // module is imported lazily so supabase-js stays off every public page's first load.
  useEffect(() => {
    let active = true
    import('@/lib/supabase/client')
      .then(({ createClient }) => createClient().auth.getSession())
      .then(({ data }) => {
        const u = data.session?.user
        if (!active || !u) return
        const name = (u.user_metadata?.full_name as string | undefined) || u.email || ''
        setViewer({ initial: (name.trim()[0] || 'F').toUpperCase() })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Scroll: shrink, hide/return, progress. One rAF-throttled read per frame.
  useEffect(() => {
    let last = window.scrollY
    let queued = false
    const tick = () => {
      queued = false
      const y = window.scrollY
      const h = document.documentElement.scrollHeight - window.innerHeight
      setScrolled(y > 24)
      if (y > last + 6 && y > 240) setHidden(true)
      else if (y < last - 6) setHidden(false)
      navRef.current?.style.setProperty('--fq-p', h > 0 ? (y / h).toFixed(3) : '0')
      last = y
    }
    const onScroll = () => {
      if (!queued) {
        queued = true
        requestAnimationFrame(tick)
      }
    }
    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Outside click closes the menu; Escape closes whatever is open; "/" opens search.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menu.isOpen && navRef.current && !navRef.current.contains(e.target as Node)) hideMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (search.isOpen) search.hide()
        else if (menu.isOpen) {
          hideMenu()
          navRef.current?.querySelector<HTMLElement>(`[data-k="${menuKey}"]`)?.focus()
        }
        if (sheet.isOpen) sheet.hide()
      }
      const t = document.activeElement?.tagName ?? ''
      if (e.key === '/' && !search.isOpen && !/INPUT|TEXTAREA|SELECT/.test(t)) {
        e.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu.isOpen, menuKey, hideMenu, search, sheet, openSearch])

  // The search box takes focus as it opens; the sheet holds the page still while it is up.
  useEffect(() => {
    if (search.mounted) inputRef.current?.focus()
  }, [search.mounted])
  useEffect(() => {
    if (!sheet.mounted) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev
    }
  }, [sheet.mounted])

  const fine = () => window.matchMedia('(hover:hover) and (pointer:fine)').matches
  const intent = (fn: () => void, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(fn, ms)
  }
  // A link inside an overlay closes it, including a same-page #hash link that changes no route.
  const closeOnLink = (close: () => void) => (e: React.MouseEvent) => {
    if ((e.target as Element).closest('a')) close()
  }

  const results = searchSite(query)
  const cta = page.cta ?? 'side'
  const ctaNode =
    cta === 'none' ? null : cta === 'side' ? (
      <>
        <Link className="btn fq-iri-btn p-only" href={SIDE_CTA.p.href!}>
          {SIDE_CTA.p.label}
        </Link>
        <Link className="btn fq-iri-btn e-only" href={SIDE_CTA.e.href!}>
          {SIDE_CTA.e.label}
        </Link>
      </>
    ) : (
      <Link className="btn fq-iri-btn" href={cta.href}>
        {cta.label}
      </Link>
    )

  const navClass = [
    'nav dark',
    scrolled && 'is-scrolled',
    hidden && !menu.isOpen && 'is-hidden',
    menu.mounted && 'mm-open',
    viewer && 'is-auth',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <header
        ref={navRef}
        id="nav"
        className={navClass}
        onMouseLeave={() => fine() && intent(hideMenu, 280)}
        onMouseEnter={() => clearTimeout(timer.current)}
        onFocus={() => setHidden(false)}
      >
        <Link href={ROUTES.home} className="lg-fx" aria-label="Frequency home">
          <Image className="logo" src={WORDMARK} alt="Frequency Community Collective" width={1920} height={389} priority />
          <span className="lg-sheen" aria-hidden="true" style={{ '--fq-lg': `url("${WORDMARK}")` } as React.CSSProperties} />
        </Link>

        <nav className="mm-bar" aria-label="Main">
          {([...WING_MENUS.map((m) => [m.key, m.label] as const), ['packages', FEATURES_LABEL] as const]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`mm-trig${here === k ? ' is-here' : ''}`}
              aria-expanded={open === k}
              aria-haspopup="true"
              aria-controls={PANEL_ID}
              data-k={k}
              onMouseEnter={() => fine() && intent(() => showMenu(k), menu.isOpen ? 60 : 180)}
              onClick={(e) => {
                e.stopPropagation()
                clearTimeout(timer.current)
                if (open === k) hideMenu()
                else showMenu(k)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') return
                e.preventDefault()
                showMenu(k)
                requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('a,button')?.focus())
              }}
            >
              {label}
              <Chev />
            </button>
          ))}
          {DIRECT_LINKS.filter((d) => d.href).map((d) => {
            const isHere = pathname === d.href
            return (
              <Link
                key={d.label}
                className={`mm-trig${isHere ? ' is-here' : ''}`}
                href={d.href!}
                aria-current={isHere ? 'page' : undefined}
                onMouseEnter={() => intent(hideMenu, 180)}
              >
                {d.label}
              </Link>
            )
          })}
        </nav>

        <div className="acct">
          {viewer ? (
            <>
              <button type="button" className="acct-ic" aria-label="Search (press /)" onClick={openSearch}>
                <FqIcon name="search" />
              </button>
              <Link className="acct-me" href={ROUTES.feed}>
                <span className="acct-av">{viewer.initial}</span>
                <span className="acct-nm">Your feed</span>
              </Link>
            </>
          ) : (
            <>
              <button type="button" className="acct-ic" aria-label="Search (press /)" onClick={openSearch}>
                <FqIcon name="search" />
              </button>
              <Link className="acct-login" href={ROUTES.signIn}>
                Log in
              </Link>
              <span className="acct-cta">{ctaNode}</span>
            </>
          )}
          <button type="button" className="mm-menu" aria-expanded={sheet.isOpen} aria-controls="fq-mm-sheet" onClick={sheet.show}>
            Menu
          </button>
        </div>

        <div
          ref={panelRef}
          id={PANEL_ID}
          className={`mm-panel${menu.on ? ' on' : ''}`}
          role="region"
          aria-label={menuKey === 'packages' ? FEATURES_LABEL : WING_MENUS.find((m) => m.key === menuKey)?.label}
          hidden={!menu.mounted}
          onClick={closeOnLink(hideMenu)}
        >
          {menu.mounted && (menuKey === 'packages' ? <FeaturesPanel /> : <WingPanel wing={menuKey} />)}
        </div>
        <span className="fq-progress" aria-hidden="true" />
      </header>

      <div className={`mm-scrim${menu.on ? ' on' : ''}`} onClick={hideMenu} aria-hidden="true" />

      <div
        className={`fq-search${search.on ? ' on' : ''}`}
        hidden={!search.mounted}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).closest('a')) search.hide()
        }}
      >
        {search.mounted && (
          <div className="fq-sbox">
            <label className="fq-sin">
              <FqIcon name="search" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Search features, pages, pricing…"
                aria-label="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) {
                    search.hide()
                    router.push(results[0].href)
                  }
                }}
              />
              <kbd>esc</kbd>
            </label>
            <div className="fq-sres" role="listbox" aria-label="Results">
              {!query.trim() && <span className="mm-h">Jump to</span>}
              {results.length ? (
                results.map((r) => <MmLink link={r} key={`${r.href}-${r.label}`} />)
              ) : (
                <p className="fq-sno">Nothing matches “{query}”. Try a feature or a page.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        id="fq-mm-sheet"
        className={`mm-sheet${sheet.on ? ' on' : ''}`}
        hidden={!sheet.mounted}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClick={closeOnLink(sheet.hide)}
      >
        {sheet.mounted && (
          <>
            <div className="mm-shtop">
              <span className="mm-h">Menu</span>
              <button type="button" className="acct-ic" aria-label="Close menu" onClick={sheet.hide}>
                ✕
              </button>
            </div>
            <button
              type="button"
              className="fq-sin as-btn"
              onClick={() => {
                sheet.hide()
                openSearch()
              }}
            >
              <FqIcon name="search" />
              <span>Search features, pages, pricing…</span>
            </button>
            <div className="mm-shcta">
              {viewer ? (
                <Link className="btn fq-iri-btn" href={ROUTES.feed}>
                  Your feed
                </Link>
              ) : (
                <>
                  <Link className="btn btn-ghost fq-iri-rim" href={ROUTES.signIn}>
                    Log in
                  </Link>
                  <Link className="btn fq-iri-btn" href={SIDE_CTA[side].href!}>
                    {SIDE_CTA[side].label}
                  </Link>
                </>
              )}
            </div>
            {WING_MENUS.map((m) => (
              <details key={m.key} open={here === m.key}>
                <summary>{m.label}</summary>
                {m.cols.flatMap((c) => c.links).map((l) => (
                  <MmLink link={l} key={l.label} />
                ))}
              </details>
            ))}
            <details open={here === 'packages'}>
              <summary>{FEATURES_LABEL}</summary>
              {FEATURE_JOURNEYS.map((s) => (
                <MmLink
                  key={s.side}
                  link={{
                    href: featuresWingHref(s.side),
                    label: s.label,
                    hint: s.jobs.map((j) => j.job).join(' · '),
                    icon: s.side === 'e' ? 'space' : 'circle',
                  }}
                />
              ))}
            </details>
            {DIRECT_LINKS.filter((d) => d.href).map((d) => (
              <Link className="mm-shlink" href={d.href!} key={d.label}>
                {d.label}
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  )
}
