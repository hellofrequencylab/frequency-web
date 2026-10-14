'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { activeNav, itemBadge, type AdminNavItem } from './nav-model'

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
  const active = items.find((item) => item.key === activeKey && !item.external && !!item.children?.length)
  return (
    <>
    <nav className="ad-nav" aria-label={label}>
      {items.map((item) => {
        const on = item.key === activeKey
        const badge = on && item.children?.length ? item.badge ?? 0 : itemBadge(item)
        return (
          <div key={item.key} className="ad-nav-group">
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
        )
      })}
    </nav>
    {/* On a phone the nav is one sideways row, where the in-group .ad-sub column has no room (it widened the
        active row across the strip), so the active section's pages get their own strip under it. CSS shows
        exactly one of the two; the other is display:none, out of the tab order and the accessibility tree. */}
    {active?.children && (
      <nav className="ad-strip" aria-label={`${active.label} pages`}>
        {active.children.map((leaf) => (
          <Link key={leaf.key} href={leaf.href} className={leaf.key === activeLeafKey ? 'on' : undefined} aria-current={leaf.key === activeLeafKey ? 'page' : undefined}>
            {leaf.label}
            {!!leaf.badge && <b aria-label={`${leaf.badge} waiting`}>{leaf.badge}</b>}
          </Link>
        ))}
      </nav>
    )}
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
