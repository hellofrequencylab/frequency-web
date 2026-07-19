'use client'

// MARKETING PILLS — the client, no-reload sub-nav for the space Marketing tab. The SAME classifieds pill
// row (MarketplaceFacets shape: rounded-full pills, primary = active), but instead of navigating it swaps
// which panel is shown IN PLACE: no route change, no reload, the content slides over to the next area
// (animate-panel-slide). Each panel is a server-rendered slot handed down from the Server Component, so the
// pill row never re-fetches; it only reveals a panel that is already in the payload.
//
// Only the active panel is mounted, so a heavy surface's client state resets when you leave it (acceptable
// for these self-contained surfaces). The pill row scrolls horizontally on narrow screens (admin-subnav-scroll
// gives it the hidden-scrollbar + edge-fade treatment). Voice canon: no em dashes.

import { useState } from 'react'
import type { ReactNode } from 'react'

export interface MarketingPanel {
  key: string
  label: string
  node: ReactNode
}

export function MarketingPills({ panels }: { panels: MarketingPanel[] }) {
  const [active, setActive] = useState(panels[0]?.key ?? '')
  const current = panels.find((p) => p.key === active) ?? panels[0]

  return (
    <div className="space-y-5">
      <div className="admin-subnav-scroll -mx-1 overflow-x-auto px-1">
        <nav className="flex w-max gap-2" aria-label="Marketing sections">
          {panels.map((p) => {
            const on = p.key === (current?.key ?? '')
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(p.key)}
                aria-current={on ? 'page' : undefined}
                className={
                  'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (on
                    ? 'bg-primary text-on-primary'
                    : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
                }
              >
                {p.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* The active panel, re-keyed so it slides in each time the pill changes. */}
      <div key={current?.key} className="animate-panel-slide">
        {current?.node}
      </div>
    </div>
  )
}
