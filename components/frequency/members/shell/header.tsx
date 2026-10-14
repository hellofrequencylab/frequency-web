'use client'

// THE FREQUENCY MEMBER HEADER, on the members kit's official app shell (templates/members/app/shell.js;
// kit-members.css `.ap-hdr`, `.ap-nav`, `.ap-mega`, `.ap-sheets`, `.ap-scrim`).
//
//   <header .ap-hdr [.scrolled] [.open]>
//     .ap-hdr-l   the flowing wordmark (.ap-logo) and the roundel the kit swaps in under 1240px
//     .ap-hdr-c   the section pill (.ap-nav), Search (⌘K), Messages, Notifications, the Zap button
//     .ap-hdr-r   the avatar
//   .ap-mega      the full-width section menu        .ap-sheets  the Zap and Notifications sheets
//   .ap-scrim     the click-away layer under them
//
// The kit owns the look: transparent at the top, frosted once scrolled (`.scrolled`, past 8px) or with
// a menu open (`.open`). Escape, the scrim or a navigation closes whatever is open.
//
// Owner rulings over the design (2026-10-13): the pill's FIRST item is a plain link, "Home" on the Feed
// (to MEMBER_HOME_HREF) and "Feed" everywhere else (homeFeedItem), not a menu section; the logo goes to
// the Feed, and on the Feed it scrolls to the top and refreshes the stream; every menu section ends
// with the Frequency website row (FQ_SITE_LINKS); the menu panel paints no background
// (members-shell.css). The design's burger opens its left-rail drawer, which this shell does not have,
// so it is not drawn and the pill stays on phones (members-shell.css).
//
// Every count here is the one the layout already reads (notifications unread, messages unread,
// the viewer's streak); nothing is sample data.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, use, useEffect, useState, useTransition } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { SearchOverlay } from '@/components/search/search-overlay'
import type { NavViewer } from '@/lib/nav/registry'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/lib/notifications-map'
import { notificationHref } from '@/lib/notifications/href'
import { relativeTime, getInitials } from '@/lib/utils'
import { isFullViewportEditor } from '@/lib/layout/page-chrome'
import { FEED_HREF, FQ_NAV, FQ_SITE_LINKS, areaFor, canShow, homeFeedItem, photoUrl, resolveHref, type FqNavSection } from './nav'
import { avatarBg } from './avatar'

type Open = FqNavSection['key'] | 'zap' | 'bell' | null

export interface FqHeaderProps {
  profile: { display_name: string; handle: string; avatar_url: string | null }
  profileHref: string
  navAccess?: Record<string, string>
  unreadCount: number
  messagesUnread: number
  /** The viewer's streak, resolved behind Suspense (The Quest menu's footer line). */
  streak: Promise<number>
  viewer: NavViewer
}

export function FqHeader({ profile, profileHref, navAccess, unreadCount, messagesUnread, streak, viewer }: FqHeaderProps) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const area = areaFor(pathname, profileHref)
  const first = homeFeedItem(pathname)
  const [open, setOpen] = useState<Open>(null)
  // The last section opened stays in the menu while it fades out.
  const [shown, setShown] = useState<FqNavSection | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // A navigation closes any open menu or sheet.
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(null)
  }

  // shell.js `hdrState`: frosted once the page has scrolled past 8px.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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

  const toggle = (k: Exclude<Open, null>) => {
    const next = open === k ? null : k
    const s = FQ_NAV.find((x) => x.key === next)
    if (s) setShown(s)
    setOpen(next)
  }
  const megaOn = FQ_NAV.some((s) => s.key === open)

  // A Link to the page you are on does nothing, so on the Feed the logo goes back to the top of the
  // stream and refreshes it instead.
  const onLogo = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== FEED_HREF || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
    router.refresh()
  }

  const hdrClass = ['ap-hdr', scrolled && 'scrolled', open && 'open'].filter(Boolean).join(' ')

  return (
    <>
      <header className={hdrClass}>
        <div className="ap-hdr-l">
          <Link href={FEED_HREF} className="ap-logo fq-logo-flow" aria-label="Frequency, your Feed" onClick={onLogo} />
          <Link href={FEED_HREF} className="ap-roundel" aria-label="Frequency, your Feed" onClick={onLogo} />
        </div>
        <div className="ap-hdr-c">
          <nav className="ap-nav" aria-label="Sections">
            <Link href={first.href} title={first.label}>
              <FqIcon name={first.icon} />
              <span>{first.label}</span>
            </Link>
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
          <button type="button" className="btn pa ap-zap" aria-expanded={open === 'zap'} aria-controls="fqm-zap" onClick={() => toggle('zap')}>
            <FqIcon name="zap" />
            Zap
          </button>
        </div>
        <div className="ap-hdr-r">
          <Link
            href={profileHref}
            className="ap-me"
            title={profile.display_name}
            aria-label={`Your profile, ${profile.display_name}`}
            style={avatarBg(profile.avatar_url)}
          >
            {profile.avatar_url ? null : getInitials(profile.display_name)}
          </Link>
        </div>
      </header>

      <div
        className={megaOn ? 'ap-mega on' : 'ap-mega'}
        id="fqm-menu"
        role="region"
        aria-label={shown?.label ?? 'Menu'}
        aria-hidden={!megaOn}
        inert={!megaOn}
      >
        {shown && <MegaMenu section={shown} navAccess={navAccess} profileHref={profileHref} streak={streak} />}
      </div>
      <div className="ap-sheets">
        <div
          className={open === 'zap' ? 'ap-sheet on' : 'ap-sheet'}
          id="fqm-zap"
          role="dialog"
          aria-label="Capture a moment"
          aria-hidden={open !== 'zap'}
          inert={open !== 'zap'}
        >
          <ZapSheet onClose={() => setOpen(null)} />
        </div>
        <div
          className={open === 'bell' ? 'ap-sheet on' : 'ap-sheet'}
          data-s="bell"
          role="dialog"
          aria-label="Notifications"
          aria-hidden={open !== 'bell'}
          inert={open !== 'bell'}
        >
          {open === 'bell' && <BellSheet />}
        </div>
      </div>
      <div className={open ? 'ap-scrim on' : 'ap-scrim'} aria-hidden onClick={() => setOpen(null)} />

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} viewer={viewer} />}
    </>
  )
}

/** shell.js `megaHTML`: two link columns, the photo cards, the footer line and its call to action,
 *  then the Frequency website row (owner ruling). */
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
    <>
      <div className="ap-mega-in">
        {section.cols.map((c) => (
          <div key={c.h} className="ap-mega-col">
            <span className="k">{c.h}</span>
            {c.items
              .filter((it) => canShow(it, navAccess))
              .map((it) => (
                <Link key={it.label} href={resolveHref(it.href, profileHref)}>
                  <FqIcon name={it.icon} />
                  <span>
                    <b>{it.label}</b>
                    <span>{it.sub}</span>
                  </span>
                </Link>
              ))}
          </div>
        ))}
        <div className="ap-mega-cards">
          {section.cards.map((k) => (
            <Link key={k.title} href={resolveHref(k.href, profileHref)}>
              <span className="ph" style={{ backgroundImage: `url(${photoUrl(k.photo)})` }} />
              <span className="k">{k.kicker}</span>
              <span className="h3">{k.title}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="ap-mega-foot">
        {section.key === 'quest' ? (
          <Suspense fallback={<span>{section.foot}</span>}>
            <StreakFoot streak={streak} line={section.foot} />
          </Suspense>
        ) : (
          <span>{section.foot}</span>
        )}
        <Link href={resolveHref(section.footHref, profileHref)} className="btn pa lg">
          {section.footCta}
        </Link>
      </div>
      <nav className="fqm-mega-site" aria-label="Frequency website">
        <span className="k">Frequency</span>
        {FQ_SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  )
}

/** "Day 12. You showed up again." with the viewer's real streak; the bare line when there is none. */
function StreakFoot({ streak, line }: { streak: Promise<number>; line: string }) {
  const n = use(streak)
  return <span>{n > 0 ? `Day ${n}. ${line}` : line}</span>
}

/** shell.js's Zap sheet: four round actions and the Mindless row. */
function ZapSheet({ onClose }: { onClose: () => void }) {
  const capture = (mode: 'post' | 'contact') => {
    window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode } }))
    onClose()
  }
  return (
    <>
      <span className="ap-sheet-t">Capture a moment.</span>
      <div className="ap-zapg">
        <button type="button" onClick={() => capture('post')}>
          <span>
            <i><FqIcon name="page" /></i>Share
          </span>
        </button>
        <Link href="/events/new">
          <span>
            <i><FqIcon name="event" /></i>Event
          </span>
        </Link>
        <button type="button" onClick={() => capture('contact')}>
          <span>
            <i><FqIcon name="contacts" /></i>Contact
          </span>
        </button>
        <Link href="/codes">
          <span>
            <i><FqIcon name="qr" /></i>Connect
          </span>
        </Link>
      </div>
      <Link href="/on-air" className="ap-sheet-row" data-energy="still">
        <span className="orb fq-breathe" style={{ width: 40, height: 40 }} />
        <span>
          <b>Mindless</b>
          <span className="t2">Tune out</span>
        </span>
      </Link>
      <span className="t2">Soon: Check In · Ghost Node · Partners</span>
    </>
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

/** shell.js's Notifications sheet (`.rr-h` heading, `.ap-note` rows), filled with the viewer's own. */
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
    <>
      <div className="rr-h">
        <span className="h3">Notifications</span>
        <Link href="/settings/notifications" className="t2">
          Manage
        </Link>
      </div>
      {failed && <p className="ap-note">Notifications could not load. Close this and open it again in a moment.</p>}
      {!failed && items === null && <p className="ap-note">Loading…</p>}
      {items && items.length === 0 && <p className="ap-note">You&rsquo;re caught up.</p>}
      {items?.map((n) => (
        <Link key={n.id} href={notificationHref(n)} className={n.read_at ? 'ap-note' : 'ap-note unread'}>
          <FqIcon name={noteIcon(n.type)} />
          <span>
            <span>
              {n.actor ? `${n.actor.display_name} ` : ''}
              {n.body}
            </span>
            <span className="t2">{relativeTime(n.created_at)}</span>
          </span>
        </Link>
      ))}
    </>
  )
}
