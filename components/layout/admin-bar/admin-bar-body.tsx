'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Search, Settings } from 'lucide-react'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { SPINE_META } from '@/lib/admin/modules/spine'
import type { SettingsPanelModel, SearchableApp } from '@/components/layout/settings-panel'

// ── The AdminBar BODY (docs/ADMIN-RAIL.md — inline-first rail, ADR-514) ─────────────────────────────
// A single FLAT, spine-ordered scrolling list: for each populated slot a lightweight section header
// (SPINE_META label + Icon) followed by that slot's nodes — inline editors and/or feature-workflow
// link-rows, all in view at once ("everything all in view", the owner directive). No two-level
// drill-down: categories are headers, not drill targets. Every section is open by default.
//   • SEARCH — a persistent "Search settings" box pinned at the top FILTERS the list: a non-empty query
//     shows a flat result list across ALL scoped apps; picking a result clears the query and SCROLLS to
//     that app's section. This is the Hick's-Law mitigation for a taller bar. aria-live announces it.
// No CLS: the rail width is fixed by the chrome; this body only swaps stable-sized sections.

/** A tiny subsequence test — every char of `q` appears in order within `text` (cmdk-style fuzzy). */
function isSubsequence(q: string, text: string): boolean {
  if (!q) return true
  let i = 0
  for (const ch of text) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

/** Whether a scoped app matches the query on its label, description, or category name. */
function appMatches(app: SearchableApp, q: string): boolean {
  const categoryLabel = app.category !== 'element' ? SPINE_META[app.category]?.label ?? '' : ''
  const hay = `${app.label} ${app.description ?? ''} ${categoryLabel}`.toLowerCase()
  return hay.includes(q) || isSubsequence(q.replace(/\s+/g, ''), hay.replace(/\s+/g, ''))
}

export function AdminBarBody({ model }: { model: SettingsPanelModel }) {
  const [query, setQuery] = useState('')

  // Section elements by slot, so a search result can scroll to its section once the list remounts.
  const sectionRefs = useRef(new Map<AdminSlot, HTMLElement>())
  // The section a just-picked search result wants to reveal (consumed after the query clears).
  const pendingScrollRef = useRef<AdminSlot | null>(null)

  const q = query.trim().toLowerCase()
  const results = useMemo(
    () => (q ? model.searchApps.filter((a) => appMatches(a, q)) : []),
    [q, model.searchApps],
  )

  // After a result clears the query, the sections remount — scroll the pending one into view + focus it.
  useEffect(() => {
    if (q) return
    const slot = pendingScrollRef.current
    if (!slot) return
    pendingScrollRef.current = null
    const el = sectionRefs.current.get(slot)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.focus()
    }
  }, [q])

  function revealSection(slot: AdminSlot) {
    pendingScrollRef.current = slot
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Escape clears a query before the chrome closes the bar (P7).
    if (e.key === 'Escape' && query) {
      setQuery('')
      e.stopPropagation()
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search settings"
          placeholder="Search settings"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {q ? (
        // ── SEARCH results — a flat list across all scoped apps (derived filter, not a screen). ──
        <div aria-live="polite" className="space-y-1">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            {results.length === 0
              ? 'No settings match'
              : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </p>
          {results.map((app) => {
            const hasSection = model.sections.some((s) => s.slot === app.category)
            const RowIcon =
              app.Icon ?? (app.category !== 'element' ? SPINE_META[app.category]?.Icon : undefined) ?? Settings
            const inner = (
              <>
                <RowIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{app.label}</span>
                  {app.description && (
                    <span className="block truncate text-xs text-muted">{app.description}</span>
                  )}
                </span>
              </>
            )
            return hasSection ? (
              <button
                key={app.id}
                type="button"
                onClick={() => revealSection(app.category as AdminSlot)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
              >
                {inner}
              </button>
            ) : (
              <div key={app.id} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
                {inner}
              </div>
            )
          })}
        </div>
      ) : (
        // ── The flat, spine-ordered sections (all open), then the operator Page group + locked rows. ──
        <>
          <div className="space-y-6">
            {model.sections.map((section) => (
              <section
                key={section.slot}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.slot, el)
                  else sectionRefs.current.delete(section.slot)
                }}
                tabIndex={-1}
                className="min-w-0 scroll-mt-2 space-y-4 focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <section.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <h2 className="text-2xs font-semibold uppercase tracking-wide text-subtle">
                    {section.label}
                  </h2>
                </div>
                <div className="space-y-4">
                  {section.nodes.map((node, i) => (
                    <div key={`${section.slot}-${i}`} className="min-w-0">
                      {node}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* The operator page-globals group, set apart by a hairline. Suppressed on entity scopes. */}
          {model.pageGroup && (
            <div className="min-w-0 space-y-4">
              {model.sections.length > 0 && <hr className="border-border" />}
              {model.pageGroup}
            </div>
          )}

          {/* ── LOCKED rows (Phase 5 / P3): attainable-but-locked apps — a lock + one-line reason,
              never a working editor (fail-closed). The optional CTA is the only interactive element. ── */}
          {model.lockedApps.length > 0 && (
            <div className="space-y-1 pt-2">
              {(model.sections.length > 0 || model.pageGroup) && <hr className="border-border" />}
              <p className="px-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Unlock more</p>
              {model.lockedApps.map((row) => (
                <div key={row.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-muted">
                      <span className="sr-only">Locked. </span>
                      {row.label}
                    </span>
                    <span className="block text-xs text-subtle">{row.reason}</span>
                    {row.cta && (
                      <a
                        href={row.cta.href}
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        {row.cta.label}
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
