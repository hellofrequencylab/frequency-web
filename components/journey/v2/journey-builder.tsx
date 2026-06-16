'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ListTree, FileText, SlidersHorizontal, Eye } from 'lucide-react'

// Journeys v2 — the FULL-PAGE course builder (replaces the old popup). Best-practice course-creator
// layout: a sticky builder bar (eyebrow + title + status + Preview + Done) over three tabs —
// Curriculum (the structure editor, the star), Details (identity/cover/release), and Settings
// (advanced + danger). The right community rail stays mounted but starts collapsed to a mini strip
// on this route (page-chrome railStartsCollapsed), so the builder gets the full width by default.
// Panels stay mounted (toggled with `hidden`) so unsaved input survives tab switches; every section
// autosaves on blur, so there is no Save button — Done just returns to the library.

type Tab = 'curriculum' | 'details' | 'settings'

const TABS: { id: Tab; label: string; icon: typeof ListTree }[] = [
  { id: 'curriculum', label: 'Curriculum', icon: ListTree },
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
]

function StatusPill({ status }: { status: string }) {
  const live = status === 'published'
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
        live ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'
      }`}
    >
      {live ? 'Published' : 'Draft'}
    </span>
  )
}

export function JourneyBuilder({
  slug,
  title,
  status,
  curriculum,
  details,
  settings,
}: {
  slug: string
  title: string
  status: string
  curriculum: ReactNode
  details: ReactNode
  /** Advanced + Danger zone, stacked. */
  settings: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('curriculum')

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Builder bar — sticky just under the app header (h-14). The negative margins let its
            blur + border bleed to the container edges as the page scrolls. */}
        <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-border bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <span>Studio · Journey</span>
                <StatusPill status={status} />
              </div>
              <h1 className="truncate text-lg font-bold text-text">{title || 'Untitled Journey'}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-2xs text-subtle sm:inline">Changes autosave</span>
              <Link
                href={`/journeys/${slug}/learn`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated"
              >
                <Eye className="h-4 w-4" /> Preview
              </Link>
              <Link
                href="/journeys"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <ArrowLeft className="h-4 w-4" /> Done
              </Link>
            </div>
          </div>

          <div role="tablist" aria-label="Builder sections" className="mt-3 flex items-center gap-1">
            {TABS.map((t) => {
              const on = tab === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    on ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panels — all mounted, one shown (preserves unsaved input across tab switches). */}
        <div className={tab === 'curriculum' ? '' : 'hidden'}>{curriculum}</div>
        <div className={tab === 'details' ? '' : 'hidden'}>{details}</div>
        <div className={tab === 'settings' ? 'space-y-8' : 'hidden'}>{settings}</div>
      </div>
    </div>
  )
}
