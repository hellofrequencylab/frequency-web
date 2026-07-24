'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Lock, Settings } from 'lucide-react'
import { SPINE_META } from '@/lib/admin/modules/spine'
import type { AdminSection, SettingsPanelModel, SearchableApp } from '@/components/layout/settings-panel'
import { HubRail } from '@/components/layout/admin-bar/hub-rail'
import { SpaceRailDataProvider } from '@/components/admin/modules/space-rail-data'
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-row'

// ── The AdminBar body ON MOBILE — a DRILL-DOWN of the SAME model the desktop rail renders inline.
// The desktop `AdminBarBody` (ADR-514 inline-first) is a great use of a wide rail column; on a phone that
// same flat scroll of heterogeneous editors is a mile long with no map. So mobile renders the identical
// `SettingsPanelModel` as the iOS/Discord pattern: a menu of section rows → tap → a full-width detail
// screen with just that section's editors (the model's already-built `nodes`) → back. This is a pure
// RE-PRESENTATION: it never touches the model, the catalog (MENU-CONTRACT / ADR-553), or the desktop body,
// so the menu drift-guards are unaffected. Search still filters the whole scoped set and jumps into a
// section. App-chrome DAWN tokens only; voice canon (no em dashes).

function sectionKey(s: AdminSection): string {
  return `${s.tier}:${s.slot}`
}

/** Fuzzy-ish match on label / description / category (a light mirror of the desktop body's search). */
function appMatches(app: SearchableApp, q: string): boolean {
  const categoryLabel = app.category !== 'element' ? SPINE_META[app.category]?.label ?? '' : ''
  return `${app.label} ${app.description ?? ''} ${categoryLabel}`.toLowerCase().includes(q)
}

export function AdminBarMobile({
  model,
  query,
  onQueryChange,
}: {
  model: SettingsPanelModel
  query: string
  onQueryChange: (value: string) => void
}) {
  const pathname = usePathname()
  // ADR-550: provide the Space rail bundle to every Space module below (same as the desktop body).
  const spaceSlug = pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  // A live search takes precedence over any drilled-in section, so typing from a detail screen surfaces
  // results across the whole scoped set.
  const active = !q && activeKey ? model.sections.find((s) => sectionKey(s) === activeKey) ?? null : null

  const openSection = (s: AdminSection) => {
    onQueryChange('')
    setActiveKey(sectionKey(s))
  }

  return (
    <SpaceRailDataProvider slug={spaceSlug}>
      {active ? (
        // ── DETAIL: one section's editors, full width, with a back affordance. ──
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveKey(null)}
            className="-ml-1 flex items-center gap-1 rounded-lg px-1 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden /> All settings
          </button>
          <div className="flex items-center gap-2">
            <active.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <h2 className="text-sm font-semibold text-text">{active.label}</h2>
          </div>
          <div className="space-y-4">
            {active.nodes.map((item) => (
              <div key={item.id} className="min-w-0 space-y-2">
                {active.nodes.length > 1 && item.label && (
                  <h3 className="text-xs font-semibold text-text">{item.label}</h3>
                )}
                {item.node}
              </div>
            ))}
          </div>
        </div>
      ) : q ? (
        // ── SEARCH: a flat list across the scoped apps; tap jumps into that section. ──
        <div aria-live="polite" className="space-y-2">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            {(() => {
              const n = model.searchApps.filter((a) => appMatches(a, q)).length
              return n === 0 ? 'No settings match' : `${n} ${n === 1 ? 'result' : 'results'}`
            })()}
          </p>
          <SettingsGroup>
            {model.searchApps
              .filter((a) => appMatches(a, q))
              .map((app) => {
                const target = model.sections.find((s) => s.tier === app.tier && s.slot === app.category)
                const Icon =
                  app.Icon ?? (app.category !== 'element' ? SPINE_META[app.category]?.Icon : undefined) ?? Settings
                return (
                  <SettingsRow
                    key={app.id}
                    icon={Icon}
                    title={app.label}
                    description={app.description}
                    onClick={target ? () => openSection(target) : undefined}
                  />
                )
              })}
          </SettingsGroup>
        </div>
      ) : (
        // ── ROOT menu: the Hub (if any), the section menu, page group, locked rows, "More", then the bank. ──
        <div className="space-y-4">
          {model.hub && <HubRail spec={model.hub} bank={model.bank} />}

          {(() => {
            const inlineSections = model.sections.filter((s) => s.tier !== 'extra')
            return (
              inlineSections.length > 0 && (
                <SettingsGroup>
                  {inlineSections.map((s) => (
                    <SettingsRow
                      key={sectionKey(s)}
                      icon={s.Icon}
                      title={s.label}
                      trailing={s.nodes.length > 1 ? String(s.nodes.length) : undefined}
                      onClick={() => openSection(s)}
                    />
                  ))}
                </SettingsGroup>
              )
            )
          })()}

          {/* The operator page-globals group, set apart. */}
          {model.pageGroup && (
            <div className="min-w-0 space-y-4">
              <hr className="border-border" />
              {model.pageGroup}
            </div>
          )}

          {/* Attainable-but-locked apps: a lock + one-line reason, never a working editor. */}
          {model.lockedApps.length > 0 && (
            <div className="space-y-1 pt-2">
              <hr className="border-border" />
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
                      <a href={row.cta.href} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                        {row.cta.label}
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* The "extra" band (Billing / Danger, ADR-514) kept OUT of the top group so a destructive surface
              is never the first thing on the menu — its own group at the bottom. */}
          {(() => {
            const extraSections = model.sections.filter((s) => s.tier === 'extra')
            return (
              extraSections.length > 0 && (
                <SettingsGroup title="More">
                  {extraSections.map((s) => (
                    <SettingsRow
                      key={sectionKey(s)}
                      icon={s.Icon}
                      title={s.label}
                      trailing={s.nodes.length > 1 ? String(s.nodes.length) : undefined}
                      onClick={() => openSection(s)}
                    />
                  ))}
                </SettingsGroup>
              )
            )
          })()}

          {/* The bottom BANK quick-links (ADR-515), suppressed when a Hub already owns them. */}
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
        </div>
      )}
    </SpaceRailDataProvider>
  )
}
