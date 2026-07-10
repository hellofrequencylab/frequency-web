import Link from 'next/link'
import { Package, Receipt, Store } from 'lucide-react'

// SPACE SHOP CONSOLE TABS (ADR-593). The persistent, URL-driven tab bar for the three-tab Shop console
// (Catalog / Orders / Storefront). Mirrors crm-view-tabs.tsx: server Links, no client state, kit tokens
// only, copy in voice (no em or en dashes). Catalog is the front door (the bare /settings/shop URL);
// Orders and Storefront are behind ?tab=. The const is SHOP_TABS (never *_MODULES — check:menu guards that).

export type ShopTab = 'catalog' | 'orders' | 'storefront'

interface Tab {
  tab: ShopTab
  label: string
  icon: typeof Package
}

const SHOP_TABS: Tab[] = [
  { tab: 'catalog', label: 'Catalog', icon: Package },
  { tab: 'orders', label: 'Orders', icon: Receipt },
  { tab: 'storefront', label: 'Storefront', icon: Store },
]

/** Narrow an arbitrary value to a ShopTab, defaulting to 'catalog'. */
export function toShopTab(raw: string | string[] | undefined): ShopTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'orders' ? 'orders' : v === 'storefront' ? 'storefront' : 'catalog'
}

export function ShopTabs({ consoleHref, active }: { consoleHref: string; active: ShopTab }) {
  return (
    <nav
      aria-label="Shop views"
      className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm"
    >
      {SHOP_TABS.map((t) => {
        const isActive = t.tab === active
        // Catalog is the default view, so its tab points at the bare console URL (no ?tab=).
        const href = t.tab === 'catalog' ? consoleHref : `${consoleHref}?tab=${t.tab}`
        const Icon = t.icon
        return (
          <Link
            key={t.tab}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              isActive ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
