'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, Lock, Search, Settings } from 'lucide-react'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { SPINE_META } from '@/lib/admin/modules/spine'
import type { SettingsPanelModel, SearchableApp } from '@/components/layout/settings-panel'

// ── The AdminBar BODY (docs/ADMIN-RAIL.md Phase 3) ─────────────────────────────────────────────────
// A browse-first, search-accelerated, iOS-Settings-style drill-down over the spine-grouped settings
// model (docs/EMBEDDED-ADMIN.md §2). Exactly two levels (P2):
//   • HOME    — the populated spine categories (icon · label · summary · ›), in fixed order, plus a
//               persistent "Search settings" box; the operator "Page" group sits below a hairline.
//   • CATEGORY — that slot's module cards (unchanged) with a Back control; drilling moves focus to the
//               detail heading (P7).
//   • SEARCH  — a fuzzy/substring filter across ALL scoped apps, rendered as a flat result list in
//               place of the home list (derived, not a third screen — P1/P6). aria-live announces it.
// COLLAPSE (P4): a single drill target renders the flat panel verbatim (model.content) — pixel-
// identical to the old panel, no home list. No CLS: the rail width is fixed by the chrome; this body
// only swaps stable-sized sections.

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
  const [screen, setScreen] = useState<AdminSlot | 'home'>('home')
  const [query, setQuery] = useState('')

  const headingRef = useRef<HTMLHeadingElement | null>(null)
  // The slot whose row should regain focus once the home list remounts (set when drilling in, so Back
  // restores focus to the row you came from — P7). Consumed by that row's ref callback.
  const returnSlotRef = useRef<AdminSlot | null>(null)

  // The category currently drilled into. Derived, so a slot that vanished after a scope change simply
  // renders the home list (no reset effect needed); a route/scope change remounts this body via its
  // `key` in AdminBar, which resets `screen` + `query` to the browse home.
  const active = screen === 'home' ? null : model.categories.find((c) => c.slot === screen) ?? null

  // Focus choreography (P7): entering a detail moves focus to its heading (return focus to the row is
  // handled by that row's ref callback once the home list remounts).
  useEffect(() => {
    if (active) headingRef.current?.focus()
  }, [active])

  function drillInto(slot: AdminSlot) {
    returnSlotRef.current = slot
    setScreen(slot)
  }

  const q = query.trim().toLowerCase()
  const results = useMemo(
    () => (q ? model.searchApps.filter((a) => appMatches(a, q)) : []),
    [q, model.searchApps],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return
    // Escape pops a level (clear a query, then leave a detail) before the chrome closes the bar (P7).
    if (query) {
      setQuery('')
      e.stopPropagation()
    } else if (screen !== 'home') {
      setScreen('home')
      e.stopPropagation()
    }
  }

  // ── COLLAPSE: a single drill target → the flat panel, verbatim (pixel-identical to the old panel). ──
  if (model.flat) return <div onKeyDown={onKeyDown}>{model.content}</div>

  // ── DETAIL: one category's module cards, with Back. ──
  if (active) {
    return (
      <div onKeyDown={onKeyDown} className="space-y-4">
        <button
          type="button"
          onClick={() => setScreen('home')}
          className="inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-sm font-medium text-muted transition-colors hover:text-text motion-reduce:transition-none"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back
        </button>
        <div className="flex items-center gap-2">
          <active.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text focus:outline-none">
            {active.label}
          </h2>
        </div>
        {active.body}
      </div>
    )
  }

  // ── HOME (+ derived SEARCH results). ──
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
        // ── SEARCH results — a flat list across all scoped apps (derived, not a screen). ──
        <div aria-live="polite" className="space-y-1">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            {results.length === 0
              ? 'No settings match'
              : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </p>
          {results.map((app) => {
            const hasCategory = model.categories.some((c) => c.slot === app.category)
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
                {hasCategory && <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />}
              </>
            )
            return hasCategory ? (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  setQuery('')
                  drillInto(app.category as AdminSlot)
                }}
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
        // ── The category browse list (fixed spine order, drop-empty), then any locked rows (P3). ──
        <>
        <div className="space-y-1">
          {model.categories.map((cat) => (
            <button
              key={cat.slot}
              type="button"
              ref={(el) => {
                if (el && returnSlotRef.current === cat.slot) {
                  el.focus()
                  returnSlotRef.current = null
                }
              }}
              onClick={() => drillInto(cat.slot)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <cat.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{cat.label}</span>
                {cat.summary && <span className="block truncate text-xs text-muted">{cat.summary}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            </button>
          ))}

          {/* The operator page-globals group, set apart by a hairline (P4 — a separate drill target). */}
          {model.pageGroup && (
            <div className="min-w-0 space-y-4 pt-2">
              {model.categories.length > 0 && <hr className="border-border" />}
              {model.pageGroup}
            </div>
          )}
        </div>

        {/* ── LOCKED rows (Phase 5 / P3): attainable-but-locked apps — a lock + one-line reason,
            never a working editor (fail-closed). Inert rows (not dead buttons); the optional CTA is
            the only interactive element, so it never reads as an editor you can open. ── */}
        {model.lockedApps.length > 0 && (
          <div className="space-y-1 pt-2">
            {(model.categories.length > 0 || model.pageGroup) && <hr className="border-border" />}
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
