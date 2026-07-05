'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, Lock, Settings } from 'lucide-react'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { SPINE_META, type RailTier } from '@/lib/admin/modules/spine'
import type {
  AdminSection,
  SettingsPanelModel,
  SearchableApp,
} from '@/components/layout/settings-panel'
import { HubRail } from '@/components/layout/admin-bar/hub-rail'
import { railArchetypeFor } from '@/lib/layout/page-chrome'
import { scoreResult, rankResults, orderByRelevance, contextualEntrySlot } from '@/lib/admin/rail-intel'
import { getProfileCompletenessRail } from '@/app/(main)/settings/rail-getters'

// ── The AdminBar BODY (docs/ADMIN-RAIL.md — inline-first rail, ADR-514; three-tier reorg) ────────────
// A band-ordered scrolling list. Each populated (tier, slot) pair is a lightweight section header
// (SPINE_META label + Icon) followed by its nodes — inline editors and/or feature-workflow link-rows.
// The bands render in importance order (the owner directive: "reorder by most-used/importance"):
//   • STANDARD — identity/profile, inline at the very top.
//   • PRIMARY  — the most-used management surfaces, ordered by importance.
//   • EXTRA    — everything else, obscured under ONE native <details> "More" disclosure (default
//                CLOSED) at the very bottom, so a destructive surface never renders expanded at top.
//   • SEARCH   — a persistent "Search settings" box pinned at the top FILTERS the whole scoped set;
//                picking a result clears the query and SCROLLS to that app's section (opening "More"
//                first when the result lives in the extra band). aria-live announces the result count.
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

/** The DOM key for a section ref — unique across bands, since a slot may appear in more than one band
 *  (personal "You" splits Profile→standard, Appearance→primary, Billing→extra). */
function sectionKey(tier: RailTier, slot: AdminSlot): string {
  return `${tier}:${slot}`
}

export function AdminBarBody({
  model,
  query,
  onQueryChange,
}: {
  model: SettingsPanelModel
  /** The "Search settings" query, owned by the panel shell (rendered in the fixed top bar, ADR-516 Phase E). */
  query: string
  onQueryChange: (value: string) => void
}) {
  // Whether the "More" (extra-band) disclosure is open. Default CLOSED; a search reveal of an extra-band
  // app opens it before scrolling so the collapsed item is revealed.
  const [moreOpen, setMoreOpen] = useState(false)

  const pathname = usePathname()
  const archetype = railArchetypeFor(pathname)

  // Section elements by (tier:slot) key, so a search result can scroll to its section once the list
  // remounts (a slot can live in two bands, so the key carries the band).
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  // The section a just-picked search result wants to reveal (consumed after the query clears).
  const pendingScrollRef = useRef<string | null>(null)
  // Whether the contextual-entry scroll has already run for this mount (so it lands ONCE on open).
  const didEnterRef = useRef(false)

  // ── Rail intelligence (ADR-516 Phase E) over EXISTING signals only ──────────────────────────────────
  // The authed viewer's profile completeness, fetched fail-safely ONLY when a personal "You" (account)
  // section is present. An incomplete profile floats that section to the top (relevance ranking) and
  // boosts its search results. A missing signal → today's order (the fetch never blocks, defaults false).
  const hasAccountSection = model.sections.some((s) => s.slot === 'account')
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  useEffect(() => {
    if (!hasAccountSection) return
    let active = true
    getProfileCompletenessRail()
      .then((d) => {
        if (active && d) setProfileIncomplete(d.percent < 100)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [hasAccountSection])

  const q = query.trim().toLowerCase()
  // Search-result scoring (ADR-516 Phase E): filter by the fuzzy match, then rank exact/prefix label match
  // > current-page scope (the app's section is mounted here) > incomplete area > everything else. Stable,
  // in-memory, no new data — a tie keeps today's order.
  const results = useMemo(() => {
    if (!q) return []
    const matched = model.searchApps.filter((a) => appMatches(a, q))
    return rankResults(matched, (a) =>
      scoreResult(q, a.label, {
        onPage: model.sections.some((s) => s.tier === a.tier && s.slot === a.category),
        incomplete: a.category === 'account' && profileIncomplete,
      }),
    )
  }, [q, model.searchApps, model.sections, profileIncomplete])

  // Standard + primary render inline; the extra band folds into the one "More" disclosure at the bottom.
  // Relevance ranking (Phase E): an incomplete "You" section floats to the top, band/tier order the tiebreak.
  const inlineSections = orderByRelevance(
    model.sections.filter((s) => s.tier !== 'extra'),
    (s) => s.slot === 'account' && profileIncomplete,
  )
  const extraSections = model.sections.filter((s) => s.tier === 'extra')
  // The honest "hidden items" count for the "More" badge — the tucked individual settings (nodes),
  // not the section headers, so a Billing + Danger viewer reads "2", not "1 group".
  const extraCount = extraSections.reduce((n, s) => n + s.nodes.length, 0)

  // After a result clears the query, the sections remount — scroll the pending one into view + focus it.
  useEffect(() => {
    if (q) return
    const key = pendingScrollRef.current
    if (!key) return
    pendingScrollRef.current = null
    const el = sectionRefs.current.get(key)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.focus()
    }
  }, [q])

  // Contextual entry (ADR-516 Phase E): when the rail opens on a page, land it scrolled to the most
  // relevant section for the archetype (e.g. the profile builder lands on Layout). Runs ONCE per mount,
  // never while searching, and fails safe — an unknown archetype or a missing target leaves the top in view.
  useEffect(() => {
    if (q || didEnterRef.current) return
    const slot = contextualEntrySlot(archetype)
    if (!slot) {
      didEnterRef.current = true
      return
    }
    const target = model.sections.find((s) => s.slot === slot)
    if (!target) return
    const el = sectionRefs.current.get(sectionKey(target.tier, target.slot))
    if (el) {
      el.scrollIntoView({ block: 'start' })
      didEnterRef.current = true
    }
  }, [q, archetype, model.sections])

  function revealSection(app: SearchableApp) {
    if (app.category === 'element') return
    // Open "More" BEFORE clearing the query when the target lives in the extra band, so its section is
    // mounted-and-visible by the time the scroll effect runs (a closed <details> hides its content).
    if (app.tier === 'extra') setMoreOpen(true)
    pendingScrollRef.current = sectionKey(app.tier, app.category)
    onQueryChange('')
  }

  // One section: a header (SPINE_META label + Icon) followed by its nodes, ref-keyed by band + slot.
  function renderSection(section: AdminSection) {
    const key = sectionKey(section.tier, section.slot)
    return (
      <section
        key={key}
        ref={(el) => {
          if (el) sectionRefs.current.set(key, el)
          else sectionRefs.current.delete(key)
        }}
        tabIndex={-1}
        className="min-w-0 scroll-mt-2 space-y-4 focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <section.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <h2 className="text-2xs font-semibold uppercase tracking-wide text-subtle">{section.label}</h2>
        </div>
        <div className="space-y-4">
          {section.nodes.map((node, i) => (
            <div key={`${key}-${i}`} className="min-w-0">
              {node}
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    // The "Search settings" input now lives in the panel's fixed top bar (admin-bar.tsx), ABOVE this scroll
    // region — so nothing renders above the search on scroll (ADR-516 Phase E). This body renders only the
    // results / sections below it.
    <div className="space-y-4">
      {q ? (
        // ── SEARCH results — a flat list across all scoped apps (derived filter, not a screen). ──
        <div aria-live="polite" className="space-y-1">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            {results.length === 0
              ? 'No settings match'
              : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </p>
          {results.map((app) => {
            const hasSection = model.sections.some(
              (s) => s.tier === app.tier && s.slot === app.category,
            )
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
                onClick={() => revealSection(app)}
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
        // ── The band-ordered sections (standard + primary inline), then the operator Page group + locked
        //    rows, then the ONE "More" disclosure (extra band) at the very bottom. ──
        <>
          {/* The compact Space identity strip (cover + logo + name), pinned at the very top of the
              standard tier (Phase 2 "keep it in the rail", ADR-514). Self-fetches + fail-safe (renders
              nothing for a non-manager); non-search branch only, so search results stay unaffected. */}
          {model.identityStrip}

          {/* ── The Hub (ADR-516 Phase B): on the `hub` archetype the body IS the stats + quick-links Hub
              (member or Space), promoted from the pinned foot. Rendered ABOVE any operator page-management
              sections, which survive on a content hub. The Hub owns the bank, so the foot bank below is
              suppressed when a Hub is present (no duplicate "Go to" grid). ── */}
          {model.hub && <HubRail spec={model.hub} bank={model.bank} />}

          <div className="space-y-6">{inlineSections.map(renderSection)}</div>

          {/* The operator page-globals group, set apart by a hairline. Suppressed on entity scopes. */}
          {model.pageGroup && (
            <div className="min-w-0 space-y-4">
              {inlineSections.length > 0 && <hr className="border-border" />}
              {model.pageGroup}
            </div>
          )}

          {/* ── LOCKED rows (Phase 5 / P3): attainable-but-locked apps — a lock + one-line reason,
              never a working editor (fail-closed). The optional CTA is the only interactive element. ── */}
          {model.lockedApps.length > 0 && (
            <div className="space-y-1 pt-2">
              {(inlineSections.length > 0 || model.pageGroup) && <hr className="border-border" />}
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

          {/* ── The "More" disclosure (ADR-514 three-tier reorg): the extra band, obscured under one
              native <details>, default CLOSED. Always mounted when there is extra content so its
              children (incl. any Danger surface) stay in the DOM for a search reveal to scroll to. ── */}
          {extraSections.length > 0 && (
            <details
              open={moreOpen}
              onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
              className="group rounded-lg border border-border"
            >
              <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-subtle outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                More
                <span
                  className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle"
                  aria-label={`${extraCount} more ${extraCount === 1 ? 'setting' : 'settings'}`}
                >
                  {extraCount}
                </span>
                <ChevronDown
                  className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <div className="space-y-6 border-t border-border px-3 pb-3 pt-4">
                {extraSections.map(renderSection)}
              </div>
            </details>
          )}

          {/* ── The bottom BANK (ADR-515 uniform rail): the fixed per-scope quick-links (manage console,
              CRM, Insights, Billing, operator) MERGED with any placement:"bank" surface, a button-grid
              pinned as the LAST block. Browse branch only (hidden in search); rendered only when non-empty. ── */}
          {!model.hub && model.bank.length > 0 && (
            <div className="min-w-0 space-y-2 pt-2">
              <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Go to</p>
              <div className="grid grid-cols-2 gap-2">
                {model.bank.map((link) => {
                  const Icon = link.icon
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 truncate">{link.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
