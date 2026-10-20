'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { activeNav, itemBadge, phoneSlots, type AdminNavItem } from './nav-model'

// The sidebar navigation and the top bar's breadcrumb (shell.js): client components only because the active
// row follows the URL across soft navigations, which a layout cannot see. Both read the same resolver, so
// the highlighted row and the breadcrumb can never disagree. Each is mounted inside a Suspense boundary by
// the shell (useSearchParams), with a fallback that renders the same rows unhighlighted.

function useActive(items: AdminNavItem[]) {
  const pathname = usePathname()
  const search = useSearchParams()
  return activeNav(items, pathname, new URLSearchParams(search.toString()))
}

export function AdminNavList({ items, label, activeKey = null, activeLeafKey = null }: {
  items: AdminNavItem[]
  label: string
  activeKey?: string | null
  activeLeafKey?: string | null
}) {
  return (
    <>
    <nav className="ad-nav" aria-label={label}>
      {items.map((item, index) => {
        const on = item.key === activeKey
        // A heading wherever the job group changes (the Space console's layers); a console without groups draws none.
        const heading = item.group && item.group !== items[index - 1]?.group ? item.group : null
        const badge = on && item.children?.length ? item.badge ?? 0 : itemBadge(item)
        return (
          <Fragment key={item.key}>
          {heading && <span className="ad-nav-h">{heading}</span>}
          <div className="ad-nav-group">
            {item.external ? (
              <a href={item.href}><FqIcon name={item.icon} />{item.label}</a>
            ) : (
              <Link href={item.href} className={on ? 'on' : undefined} aria-current={on && !activeLeafKey ? 'page' : undefined}>
                <FqIcon name={item.icon} />
                {item.label}
                {badge > 0 && <b aria-label={`${badge} waiting`}>{badge}</b>}
              </Link>
            )}
            {on && !!item.children?.length && (
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

export function AdminNav({ items, label }: { items: AdminNavItem[]; label: string }) {
  const { item, leaf } = useActive(items)
  return <AdminNavList items={items} label={label} activeKey={item?.key ?? null} activeLeafKey={leaf && leaf.href !== item?.href ? leaf.key : null} />
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
              <Link key={l.key} className="ad-pm-row" href={l.href}><FqIcon name={l.key === 'help' ? 'help' : l.key === 'events' ? 'event' : 'home'} size={20} /><span>{l.label}</span></Link>
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
