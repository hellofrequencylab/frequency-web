'use client'

// THE FREQUENCY MEMBER HEADER (shell.js + Members.dc.html `navVals()`; README §1 "Header").
//
// Sticky, 76px: the flowing wordmark (sized to the left rail so it sits over it), the Home /
// Community / The Quest / You pill whose triggers open the full-width mega menu, then Search (⌘K),
// Messages, Notifications (a 360px sheet), the Zap button (the "Capture a moment." sheet) and the
// avatar. Transparent at the top of the page, frosted while scrolling or with a menu open, and a
// lighter frost once the page has been still for 900ms. Escape, an outside click or a navigation
// closes whatever is open.
//
// Every count here is the one the layout already reads (notifications unread, messages unread,
// the viewer's streak); nothing is sample data.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, use, useEffect, useRef, useState, useTransition } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { SearchOverlay } from '@/components/search/search-overlay'
import type { NavViewer } from '@/lib/nav/registry'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/lib/notifications-map'
import { notificationHref } from '@/lib/notifications/href'
import { relativeTime, getInitials } from '@/lib/utils'
import { isFullViewportEditor } from '@/lib/layout/page-chrome'
import { FQ_NAV, FQ_SITE_LINKS, areaFor, canShow, photoUrl, resolveHref, type FqNavSection } from './nav'
import { avatarBg } from './avatar'

type Open = FqNavSection['key'] | 'zap' | 'bell' | null
type HdrState = 'top' | 'active' | 'idle'

export interface FqHeaderProps {
  profile: { display_name: string; handle: string; avatar_url: string | null }
  profileHref: string
  navAccess?: Record<string, string>
  unreadCount: number
  messagesUnread: number
  /** The viewer's streak, resolved behind Suspense (the Home menu's footer line). */
  streak: Promise<number>
  viewer: NavViewer
}

export function FqHeader({ profile, profileHref, navAccess, unreadCount, messagesUnread, streak, viewer }: FqHeaderProps) {
  const pathname = usePathname() ?? ''
  const area = areaFor(pathname, profileHref)
  const [open, setOpen] = useState<Open>(null)
  const [hdr, setHdr] = useState<HdrState>('top')
  const [searchOpen, setSearchOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A navigation closes any open menu or sheet.
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(null)
  }

  // Scroll behaviour: top → transparent; moving → frosted; still for 900ms → light frost.
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY < 8) {
        clearTimeout(idle.current)
        setHdr('top')
        return
      }
      setHdr('active')
      clearTimeout(idle.current)
      idle.current = setTimeout(() => setHdr('idle'), 900)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(idle.current)
    }
  }, [])

  // ⌘K and the app-wide 'open-search' event open the search overlay (the DAWN shell's contract).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setOpen(null)
    }
    const onOpen = () => setSearchOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-search', onOpen)
    }
  }, [])

  if (isFullViewportEditor(pathname)) return null

  const toggle = (k: Exclude<Open, null>) => setOpen((o) => (o === k ? null : k))
  const section = FQ_NAV.find((s) => s.key === open) ?? null
  const state: HdrState = open ? 'active' : hdr

  return (
    <div className="fqm-top">
      <header className="ap-hdr" data-hdr={state}>
        <Link href="/feed" className="ap-logo fq-logo-flow fqm-logo" aria-label="Frequency home" />
        <div className="fqm-cluster">
          <nav className="ap-nav" aria-label="Sections">
            {FQ_NAV.map((s) => {
              const on = open === s.key || (open == null && area === s.key)
              return (
                <button
                  key={s.key}
                  type="button"
                  className={on ? 'on' : undefined}
                  aria-expanded={open === s.key}
                  aria-controls="fqm-menu"
                  aria-current={area === s.key ? 'page' : undefined}
                  onClick={() => toggle(s.key)}
                >
                  <FqIcon name={s.icon} />
                  <span>{s.label}</span>
                </button>
              )
            })}
          </nav>
          <span className="ap-sp" />
          <Link href="/search" className="ap-search" title="Search ⌘K">
            <FqIcon name="search" />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </Link>
          <Link
            href="/messages"
            className="ap-ic"
            title="Messages"
            aria-label={messagesUnread > 0 ? `Messages, ${messagesUnread} unread` : 'Messages'}
          >
            <FqIcon name="message" />
            {messagesUnread > 0 && <i />}
          </Link>
          <BellButton unreadCount={unreadCount} open={open === 'bell'} onToggle={() => toggle('bell')} />
          <button
            type="button"
            className="btn pa ap-zap fqm-zap"
            aria-expanded={open === 'zap'}
            aria-controls="fqm-zap"
            onClick={() => toggle('zap')}
          >
            <FqIcon name="zap" />
            Zap
          </button>
        </div>
        <div className="fqm-me-end">
          <Link
            href={profileHref}
            className="ap-me fqm-me"
            title={profile.display_name}
            aria-label={`Your profile, ${profile.display_name}`}
            style={avatarBg(profile.avatar_url)}
          >
            {profile.avatar_url ? null : getInitials(profile.display_name)}
          </Link>
        </div>
      </header>

      {section && (
        <MegaMenu section={section} navAccess={navAccess} profileHref={profileHref} streak={streak} />
      )}
      {open === 'zap' && <ZapSheet onClose={() => setOpen(null)} />}
      {open === 'bell' && <BellSheet />}
      {open && <div className="fqm-scrim" aria-hidden onClick={() => setOpen(null)} />}

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} viewer={viewer} />}
    </div>
  )
}

function MegaMenu({
  section,
  navAccess,
  profileHref,
  streak,
}: {
  section: FqNavSection
  navAccess?: Record<string, string>
  profileHref: string
  streak: Promise<number>
}) {
  return (
    <div className="fqm-panel" id="fqm-menu" role="region" aria-label={section.label}>
      <div className="fqm-panel-grid">
        {section.cols.map((c) => (
          <div key={c.h} className="fqm-panel-col">
            <span className="fqm-panel-h">{c.h}</span>
            {c.items
              .filter((it) => canShow(it, navAccess))
              .map((it) => (
                <Link key={it.label} href={resolveHref(it.href, profileHref)} className="fqm-panel-link">
                  <FqIcon name={it.icon} />
                  <span>
                    <b>{it.label}</b>
                    <small>{it.sub}</small>
                  </span>
                </Link>
              ))}
          </div>
        ))}
        <div className="fqm-panel-cards">
          {section.cards.map((k) => (
            <Link key={k.title} href={resolveHref(k.href, profileHref)} className="fqm-panel-card">
              <span className="ph" style={{ backgroundImage: `url(${photoUrl(k.photo)})` }} />
              <span className="k">{k.kicker}</span>
              <b>{k.title}</b>
            </Link>
          ))}
        </div>
      </div>
      <div className="fqm-panel-foot">
        {section.key === 'home' ? (
          <Suspense fallback={<span>{section.foot}</span>}>
            <StreakFoot streak={streak} line={section.foot} />
          </Suspense>
        ) : (
          <span>{section.foot}</span>
        )}
        <Link href={resolveHref(section.footHref, profileHref)} className="btn pa">
          {section.footCta}
        </Link>
      </div>
      <nav className="fqm-panel-site" aria-label="Frequency website">
        <span className="fqm-panel-h">Frequency</span>
        {FQ_SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

/** "Day 12. You showed up again." with the viewer's real streak; the bare line when there is none. */
function StreakFoot({ streak, line }: { streak: Promise<number>; line: string }) {
  const n = use(streak)
  return <span>{n > 0 ? `Day ${n}. ${line}` : line}</span>
}

function ZapSheet({ onClose }: { onClose: () => void }) {
  const capture = (mode: 'post' | 'contact') => {
    window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode } }))
    onClose()
  }
  return (
    <div className="fqm-sheet-wrap">
      <div className="fqm-sheet-row">
        <div className="fqm-sheet" id="fqm-zap" role="dialog" aria-label="Capture a moment">
          <span className="fqm-sheet-title">Capture a moment.</span>
          <div className="fqm-zap-grid">
            <button type="button" className="fqm-zap-tile" onClick={() => capture('post')}>
              <span><FqIcon name="page" /></span>Share
            </button>
            <Link href="/events/new" className="fqm-zap-tile">
              <span><FqIcon name="event" /></span>Event
            </Link>
            <button type="button" className="fqm-zap-tile" onClick={() => capture('contact')}>
              <span><FqIcon name="contacts" /></span>Contact
            </button>
            <Link href="/codes" className="fqm-zap-tile">
              <span><FqIcon name="qr" /></span>Connect
            </Link>
          </div>
          <Link href="/on-air" className="fqm-mindless" data-energy="still">
            <span className="fq-aura" />
            <span className="fqm-orb fq-breathe" />
            <span>
              <b>Mindless</b>
              <small>Tune out</small>
            </span>
          </Link>
          <span className="fqm-soon">Soon: Check In · Ghost Node · Partners</span>
        </div>
      </div>
    </div>
  )
}

// The bell's state is shared between its button (the dot) and the sheet (the list), so it lives in
// a tiny module-level store rather than the header: opening the sheet clears the dot the way the
// DAWN bell does (load the list FIRST, then mark read, SCAN-686).
let bellUnread = 0
const bellSubs = new Set<(n: number) => void>()
function setBellUnread(n: number) {
  bellUnread = n
  bellSubs.forEach((f) => f(n))
}

function BellButton({ unreadCount, open, onToggle }: { unreadCount: number; open: boolean; onToggle: () => void }) {
  const unavailable = unreadCount < 0
  const [unread, setUnread] = useState(unavailable ? 0 : unreadCount)
  useEffect(() => {
    bellUnread = unavailable ? 0 : unreadCount
    bellSubs.add(setUnread)
    return () => {
      bellSubs.delete(setUnread)
    }
  }, [unreadCount, unavailable])
  return (
    <button
      type="button"
      className="ap-ic"
      title="Notifications"
      aria-label={
        unavailable ? 'Notifications. The unread count could not load.' : unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
      }
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onToggle}
    >
      <FqIcon name="nudge" />
      {unread > 0 && <i />}
    </button>
  )
}

function noteIcon(type: string): FqIconName {
  if (/friend|follow|connect/.test(type)) return 'contacts'
  if (/event|rsvp|ticket/.test(type)) return 'event'
  if (/badge|achievement|award|streak|rank/.test(type)) return 'standing'
  if (/zap|gem/.test(type)) return 'zap'
  if (/message|comment|reply|mention/.test(type)) return 'message'
  if (/circle/.test(type)) return 'circle'
  return 'nudge'
}

function BellSheet() {
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [, start] = useTransition()

  useEffect(() => {
    const hadUnread = bellUnread > 0
    if (hadUnread) setBellUnread(0)
    start(async () => {
      const res = await getMyNotifications()
      if (res.kind === 'error') setFailed(true)
      else setItems(res.items)
      if (hadUnread) await markAllRead()
    })
  }, [])

  return (
    <div className="fqm-sheet-wrap">
      <div className="fqm-sheet-row">
        <div className="fqm-sheet bell" role="dialog" aria-label="Notifications">
          <div className="fqm-bell-h">
            <b>Notifications</b>
            <Link href="/settings/notifications">Manage</Link>
          </div>
          {failed && <p className="fqm-note">Notifications could not load. Close this and open it again in a moment.</p>}
          {!failed && items === null && <p className="fqm-note">Loading…</p>}
          {items && items.length === 0 && <p className="fqm-note">You&rsquo;re caught up.</p>}
          {items?.map((n) => (
            <Link key={n.id} href={notificationHref(n)} className={n.read_at ? 'fqm-note' : 'fqm-note unread'}>
              <FqIcon name={noteIcon(n.type)} />
              <span>
                {n.actor ? `${n.actor.display_name} ` : ''}
                {n.body}
                <small>{relativeTime(n.created_at)}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
