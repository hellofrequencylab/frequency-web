'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { activeNav, foldAfterScroll, itemBadge, menuGroups, phoneSlots, slideTypes, type AdminNavItem, type AdminNavLeaf } from './nav-model'

// The sidebar navigation and the top bar's breadcrumb (shell.js): client components only because the active
// row follows the URL across soft navigations, which a layout cannot see. Both read the same resolver, so
// the highlighted row and the breadcrumb can never disagree. Each is mounted inside a Suspense boundary by
// the shell (useSearchParams), with a fallback that renders the same rows unhighlighted.

function useActive(items: AdminNavItem[]) {
  const pathname = usePathname()
  const search = useSearchParams()
  return activeNav(items, pathname, new URLSearchParams(search.toString()))
}

export function AdminNavList({ items, label, activeKey = null, activeLeafKey = null, topMenu = false }: {
  items: AdminNavItem[]
  label: string
  activeKey?: string | null
  activeLeafKey?: string | null
  /** The section's pages live on the top menu (AdminTopMenu), so the sidebar stays one row per section. */
  topMenu?: boolean
}) {
  return (
    <>
    <nav className="ad-nav" aria-label={label}>
      {items.map((item, index) => {
        const on = item.key === activeKey
        const slide = slideTypes(items.map((i) => i.key), activeKey, item.key)
        // A heading wherever the job group changes (the Space console's layers); a console without groups draws none.
        const heading = item.group && item.group !== items[index - 1]?.group ? item.group : null
        const badge = on && item.children?.length ? item.badge ?? 0 : itemBadge(item)
        // With the top menu on, the active section's job groups sit under it here and their pages go across the
        // top (owner, 2026-10-20: "the sub categories of the menu should be under the category on the left").
        const allGroups = on && topMenu ? menuGroups(item) : []
        const groups = allGroups.filter((g) => g.label)
        const order = ['home', ...allGroups.flatMap((g) => g.leaves.map((l) => l.key))]
        return (
          <Fragment key={item.key}>
          {heading && <span className="ad-nav-h">{heading}</span>}
          <div className="ad-nav-group">
            {item.external ? (
              <a href={item.href}><FqIcon name={item.icon} />{item.label}</a>
            ) : (
              <Link href={item.href} transitionTypes={slide} className={on ? 'on' : undefined} aria-current={on && !activeLeafKey ? 'page' : undefined}>
                <FqIcon name={item.icon} />
                {item.label}
                {badge > 0 && <b aria-label={`${badge} waiting`}>{badge}</b>}
              </Link>
            )}
            {groups.length > 0 && (
              <div className="ad-sub ad-sub-groups">
                {groups.map((g) => {
                  const here = g.leaves.some((l) => l.key === activeLeafKey)
                  const waiting = g.leaves.reduce((n, l) => n + (l.badge ?? 0), 0)
                  return (
                    <Link key={g.label} href={g.leaves[0].href} transitionTypes={slideTypes(order, activeLeafKey ?? 'home', g.leaves[0].key)} className={here ? 'on' : undefined} aria-current={here && g.leaves.length === 1 ? 'page' : undefined}>
                      {g.label}
                      {waiting > 0 ? <b aria-label={`${waiting} waiting`}>{waiting}</b> : <small aria-label={`${g.leaves.length} pages`}>{g.leaves.length}</small>}
                    </Link>
                  )
                })}
              </div>
            )}
            {on && !topMenu && !!item.children?.length && (
              <div className="ad-sub">
                {item.children.map((leaf, i, all) => (
                  <Fragment key={leaf.key}>
                    {leaf.group && leaf.group !== all[i - 1]?.group && <span className="ad-sub-h">{leaf.group}</span>}
                    <Link href={leaf.href} className={leaf.key === activeLeafKey ? 'on' : undefined} aria-current={leaf.key === activeLeafKey ? 'page' : undefined}>
                      {leaf.label}
                      {!!leaf.badge && <b aria-label={`${leaf.badge} waiting`}>{leaf.badge}</b>}
                    </Link>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
          </Fragment>
        )
      })}
    </nav>
    </>
  )
}

export function AdminNav({ items, label, topMenu = false }: { items: AdminNavItem[]; label: string; topMenu?: boolean }) {
  const { item, leaf } = useActive(items)
  return <AdminNavList items={items} label={label} topMenu={topMenu} activeKey={item?.key ?? null} activeLeafKey={leaf && leaf.href !== item?.href ? leaf.key : null} />
}

export function AdminCrumb({ root, items }: { root: string; items: AdminNavItem[] }) {
  const { item, leaf } = useActive(items)
  const title = leaf && leaf.href !== item?.href ? leaf.label : item?.label
  return <span className="crumb">{root}{title ? <> / <b>{title}</b></> : null}</span>
}

/** The phone's strip of the active section's pages, under the top bar (under 960px only; CSS). Sideways scroll,
 *  no bar. It is secondary navigation inside one section, so it stays a strip and does not join the bottom bar. */
export function AdminPhoneStrip({ items }: { items: AdminNavItem[] }) {
  const { item, leaf } = useActive(items)
  const leafKey = leaf && leaf.href !== item?.href ? leaf.key : null
  if (!item || item.external || !item.children?.length) return null
  return (
    <nav className="ad-strip" aria-label={`${item.label} pages`}>
      {item.children.map((child) => (
        <Link key={child.key} href={child.href} className={child.key === leafKey ? 'on' : undefined} aria-current={child.key === leafKey ? 'page' : undefined}>
          {child.label}
          {!!child.badge && <b aria-label={`${child.badge} waiting`}>{child.badge}</b>}
        </Link>
      ))}
    </nav>
  )
}

/** THE TOP MENU: the active section's pages across the top of every page, at every width (owner, 2026-10-20).
 *  On a wide screen the section's job groups sit under it in the sidebar (AdminNavList), so the top carries
 *  ONE row: the pages of the group you are in, or on the section's home every page under quiet group
 *  captions. On a phone the sidebar steps aside, so a groups row (the section's home first) shows above it
 *  there (CSS, .ad-tm-groups). A section without groups draws its home and pages in one row. Each row
 *  scrolls sideways with no bar. Overview has no pages and draws nothing. */
/** The top menu tucks up while you scroll down a page and returns on any scroll up, at the top of the page, or
 *  when the pointer moves into the top strip. CSS only folds it on a wide screen and never while focus is
 *  inside it, so a keyboard user and a phone keep the menu (and the active page) in view. */
function useFold() {
  const [folded, setFolded] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    last.current = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setFolded((was) => foldAfterScroll(was, y, last.current))
      last.current = y
    }
    const onMove = (e: MouseEvent) => {
      if (e.clientY < 150) setFolded(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])
  return folded
}

export function AdminTopMenu({ items }: { items: AdminNavItem[] }) {
  const { item, leaf } = useActive(items)
  const folded = useFold()
  if (!item || item.external || !item.children?.length) return null
  const groups = menuGroups(item)
  const onHome = !leaf || leaf.href === item.href
  const current = onHome ? null : groups.find((g) => g.leaves.some((l) => l.key === leaf.key)) ?? null
  const grouped = groups.some((g) => g.label)
  // The menu's reading order, home first: a link to a later entry slides forward, an earlier one back.
  const order = ['home', ...groups.flatMap((g) => g.leaves.map((l) => l.key))]
  const here = onHome ? 'home' : leaf.key
  const home = (
    <Link href={item.href} transitionTypes={slideTypes(order, here, 'home')} className={onHome ? 'on' : undefined} aria-current={onHome ? 'page' : undefined}>
      {item.label} home
    </Link>
  )
  const page = (l: AdminNavLeaf) => (
    <Link key={l.key} href={l.href} transitionTypes={slideTypes(order, here, l.key)} className={!onHome && l.key === leaf?.key ? 'on' : undefined} aria-current={!onHome && l.key === leaf?.key ? 'page' : undefined}>
      {l.label}
      {!!l.badge && <b aria-label={`${l.badge} waiting`}>{l.badge}</b>}
    </Link>
  )
  if (!grouped) {
    return (
      <div className="ad-topmenu" data-fold={folded ? '1' : undefined} style={{ viewTransitionName: 'ad-topmenu' }}>
        <nav className="ad-tm-row ad-tm-pages" aria-label={`${item.label} pages`}>
          {home}
          {groups[0].leaves.map(page)}
        </nav>
      </div>
    )
  }
  return (
    <div className="ad-topmenu" data-fold={folded ? '1' : undefined} style={{ viewTransitionName: 'ad-topmenu' }}>
      <nav className="ad-tm-row ad-tm-groups" aria-label={`${item.label} sections`}>
        {home}
        {groups.map((g) => {
          const badge = g.leaves.reduce((n, l) => n + (l.badge ?? 0), 0)
          const on = g === current
          return (
            <Link key={g.label} href={g.leaves[0].href} transitionTypes={slideTypes(order, here, g.leaves[0].key)} className={on ? 'on' : undefined} aria-current={on && g.leaves.length === 1 ? 'page' : undefined}>
              {g.label}
              {badge > 0 && <b aria-label={`${badge} waiting`}>{badge}</b>}
            </Link>
          )
        })}
      </nav>
      {current ? (
        <nav className="ad-tm-row ad-tm-pages" aria-label={`${current.label || item.label} pages`}>
          {current.label && <span className="ad-tm-h">{current.label}</span>}
          {current.leaves.map(page)}
        </nav>
      ) : (
        <nav className="ad-tm-row ad-tm-pages" aria-label={`All ${item.label} pages`}>
          {groups.map((g) => (
            <Fragment key={g.label}>
              {g.label && <span className="ad-tm-h">{g.label}</span>}
              {g.leaves.map(page)}
            </Fragment>
          ))}
        </nav>
      )}
    </div>
  )
}

export interface AdminPhoneBarProps {
  items: AdminNavItem[]
  label: string
  space: { name: string; role: string; avatarUrl: string | null; switchTo: { key: string; label: string; href: string; avatarUrl: string | null }[] }
  links: { key: string; label: string; href: string; external?: boolean }[]
}

function bg(url: string | null) {
  return url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined
}

/** THE PHONE BOTTOM BAR AND ITS MORE SHEET (under 960px; the sidebar steps aside). Four rows of the console as
 *  tabs plus More, in the member app's floating frosted bar. More opens a sheet from the bar: the Space switcher,
 *  the rows that did not get a tab, the way back to the important places, and the way out. Every row the
 *  sidebar had is somewhere on this screen. */
export function AdminPhoneBar({ items, label, space, links }: AdminPhoneBarProps) {
  const { item: current } = useActive(items)
  const pathname = usePathname()
  // The sheet remembers the page it was opened on, so going anywhere else closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => setOpenAt((at) => ((typeof next === 'function' ? next(at === pathname) : next) ? pathname : null))
  const { tabs, more } = phoneSlots(items)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenAt(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const moreActive = open || (!!current && more.some((m) => m.key === current.key))
  const rowClass = (on: boolean) => (on ? 'ad-pm-row on' : 'ad-pm-row')
  return (
    <>
      {open && <button type="button" className="ad-pm-scrim" aria-label="Close more" tabIndex={-1} onClick={() => setOpen(false)} />}
      {open && (
        <section id="ad-more-sheet" className="ad-pm-sheet" role="dialog" aria-label="More">
          <span className="ad-pm-grab" aria-hidden />
          <div className="ad-pm-card">
            <span className="av" style={bg(space.avatarUrl)} aria-hidden />
            <span className="grow"><b>{space.name}</b><small>{space.role}</small></span>
          </div>
          {space.switchTo.map((option) => (
            <Link key={option.key} href={option.href} className="ad-pm-row">
              <span className="av s" style={bg(option.avatarUrl)} aria-hidden />
              <span>Switch to {option.label}</span>
            </Link>
          ))}
          {more.length > 0 && <span className="ad-pm-h">Console</span>}
          {more.map((m) =>
            m.external ? (
              <a key={m.key} className={rowClass(false)} href={m.href}><FqIcon name={m.icon} size={20} /><span>{m.label}</span><FqIcon name="arrow" size={16} /></a>
            ) : (
              <Link key={m.key} className={rowClass(current?.key === m.key)} href={m.href} aria-current={current?.key === m.key ? 'page' : undefined}>
                <FqIcon name={m.icon} size={20} /><span>{m.label}</span>
                {itemBadge(m) > 0 && <b aria-label={`${itemBadge(m)} waiting`}>{itemBadge(m)}</b>}
              </Link>
            ),
          )}
          <span className="ad-pm-h">Go to</span>
          {links.map((l) =>
            l.external ? (
              <a key={l.key} className="ad-pm-row" href={l.href} target="_blank" rel="noopener noreferrer"><FqIcon name="globe" size={20} /><span>{l.label}</span><FqIcon name="arrow" size={16} /><span className="sr-only"> (opens in a new tab)</span></a>
            ) : (
              <Link key={l.key} className="ad-pm-row" href={l.href}><FqIcon name={l.key === 'help' || l.key === 'support' ? 'help' : l.key === 'events' ? 'event' : 'home'} size={20} /><span>{l.label}</span></Link>
            ),
          )}
          <Link className="ad-pm-row" href="/feed"><FqIcon name="arrow" size={20} /><span>Back to Frequency</span></Link>
          {!links.some((l) => l.key === 'help') && <Link className="ad-pm-row" href="/help"><FqIcon name="help" size={20} /><span>Help</span></Link>}
        </section>
      )}
      <nav className="ad-tabbar" aria-label={`${label}, main`}>
        {tabs.map((t) => {
          const on = !open && current?.key === t.key
          const badge = itemBadge(t)
          return (
            <Link key={t.key} href={t.href} className={on ? 'ad-tb on' : 'ad-tb'} aria-current={on ? 'page' : undefined} aria-label={t.label}>
              <span className="ad-tb-ic"><FqIcon name={t.icon} size={21} />{badge > 0 && <i aria-hidden />}</span>
              <span className="ad-tb-l">{t.phoneLabel}</span>
            </Link>
          )
        })}
        <button type="button" className={moreActive ? 'ad-tb on' : 'ad-tb'} aria-expanded={open} aria-controls="ad-more-sheet" onClick={() => setOpen((v) => !v)}>
          <span className="ad-tb-ic"><FqIcon name={open ? 'close' : 'more'} size={21} /></span>
          <span className="ad-tb-l">More</span>
        </button>
      </nav>
    </>
  )
}
