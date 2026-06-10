'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { PageQrManager, PageShareKit } from '@/components/qr/page-qr-manager'
import { meetsAccess } from '@/lib/nav-areas'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { CircleQuestModule } from '@/components/admin/modules/circle-quest-module'
import { CircleRailModule } from '@/components/admin/modules/circle-rail-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { ChannelSettingsModule } from '@/components/admin/modules/channel-settings-module'
import { PersonSettingsModule } from '@/components/admin/modules/person-settings-module'
import { PageContentModule } from '@/components/admin/modules/page-content-module'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'

// Header content (title + description) is operator-editable on the routes registered
// in lib/layout/editable-content.ts (ADR-180). Admin+ only.

// The on-page admin control. A small, right-aligned "Settings ▾" button sits above a
// content-width hairline rule (matching the divider under a page title). Clicking it
// opens an interior panel — within the content column, not edge-to-edge — that holds
// ONLY this page's relevant admin: a share kit (QR + link) on shareable entity pages,
// and the page-specific settings module (circle / hub / nexus / event). If a page has
// neither, the whole control renders nothing. Collapsed by default; auto-collapses on
// navigation.

// Entity detail routes that carry a slug segment (not the bare list route) — these are
// the shareable pages that get a QR/link kit.
const SHAREABLE_PREFIXES = [
  'events',
  'circles',
  'channels',
  'people',
  'hubs',
  'nexuses',
] as const

function isShareable(pathname: string): boolean {
  const m = pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (!m) return false
  return (SHAREABLE_PREFIXES as readonly string[]).includes(m[1])
}

// The page-specific settings module, if this path has one. Modules self-resolve from
// the pathname (same as admin-console.tsx), so they take no props.
function settingsModuleFor(pathname: string) {
  if (/^\/circles\/[^/]+/.test(pathname)) return <CircleSettingsModule />
  if (/^\/hubs\/[^/]+/.test(pathname)) return <HubSettingsModule />
  if (/^\/nexuses\/[^/]+/.test(pathname)) return <NexusSettingsModule />
  if (/^\/events\/[^/]+/.test(pathname)) return <EventSettingsModule />
  if (/^\/channels\/[^/]+/.test(pathname)) return <ChannelSettingsModule />
  if (/^\/people\/[^/]+/.test(pathname)) return <PersonSettingsModule />
  return null
}

// The right-quadrant module (e.g. "Circle Quest" on a circle). Sits opposite the
// page settings in the bottom row of the panel.
function questModuleFor(pathname: string) {
  if (/^\/circles\/[^/]+/.test(pathname)) return <CircleQuestModule />
  return null
}

// Rendered by the page TEMPLATES, immediately under their header divider (the line
// below the title), so the Settings control reads as a split on that line on every
// page — fed by PageAdminProvider (no per-template prop threading). Self-hides when
// the viewer isn't an operator or the page has nothing to administer.
export function PageAdminBar() {
  const { role, staffRole } = usePageAdmin()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Collapse on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const isStaff = staffRole != null
  // Two tiers: page MANAGERS (host+ / staff — each module still re-gates
  // server-side, so a host who can't manage THIS page gets empty modules) see the
  // full Settings panel; everyone else on a shareable page gets a Share panel with
  // just the QR + link. The dropdown only ever holds what the viewer can use.
  const manager = meetsAccess('host', role) || isStaff

  const shareable = isShareable(pathname)
  if (!manager && !shareable) return null

  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const settingsModule = manager ? settingsModuleFor(pathname) : null
  const questModule = manager ? questModuleFor(pathname) : null
  // Operator page-content editing (ADR-180) on configured routes — admin+ only.
  const contentModule =
    manager && (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) && meetsAccess('admin', role)
      ? <PageContentModule />
      : null

  // Nothing to administer or share here — render nothing.
  if (!shareable && !settingsModule && !questModule && !contentModule) return null

  // The bottom row: page settings (left) + quest / content (right). Only drawn
  // when at least one of those modules exists.
  const hasBottomRow = !!(settingsModule || questModule || contentModule)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${pathname}`

  return (
    <div className="-mt-3 mb-5 sm:mb-6">
      {/* Right-aligned trigger just under the page header's divider — "Settings ▾"
          for managers, "Share ▾" for everyone else on a shareable page. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          {manager ? 'Settings' : 'Share'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Panel — a CONTAINED card within the content column (not edge-to-edge), with
          generous inner padding. The page's EDIT modules come first; the QR designer
          + share/codes sit below them. Non-managers get only the share kit. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-2 space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
            {hasBottomRow && isCircle && (
              <div className="space-y-6">
                {/* Circle settings — full width across the top. */}
                {settingsModule && (
                  <div className="min-w-0">
                    <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
                    {settingsModule}
                  </div>
                )}
                {/* Quest (2/3) + rail layout (1/3) below. */}
                <div className="gap-y-6 lg:grid lg:grid-cols-3 lg:gap-x-8">
                  {questModule && <div className="min-w-0 lg:col-span-2">{questModule}</div>}
                  <div className="min-w-0 lg:col-span-1">
                    <CircleRailModule />
                  </div>
                </div>
              </div>
            )}

            {hasBottomRow && !isCircle && (
              <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
                {settingsModule && (
                  <div className="min-w-0">
                    <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
                    {settingsModule}
                  </div>
                )}
                {questModule && <div className="min-w-0">{questModule}</div>}
                {contentModule && <div className="min-w-0 lg:col-span-2">{contentModule}</div>}
              </div>
            )}

            {shareable && hasBottomRow && <hr className="border-border" />}

            {shareable && (manager
              ? <PageQrManager pathname={pathname} url={url} />
              : <PageShareKit pathname={pathname} url={url} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
