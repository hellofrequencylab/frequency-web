'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, Link2, Check, ExternalLink } from 'lucide-react'
import { PageQrManager } from '@/components/qr/page-qr-manager'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { PageContentModule } from '@/components/admin/modules/page-content-module'

// Routes whose header content (title + description) is operator-editable from this
// panel (ADR-180). Admin+ only; add a route here to make its chrome editable.
const CONTENT_EDIT_ROUTES = ['/network'] as const

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
  return null
}

export function PageAdminBar({
  role,
  staffRole,
}: {
  role: CommunityRole | null
  staffRole: StaffRole | null
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Collapse on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const isStaff = staffRole != null
  if (!(meetsAccess('host', role) || isStaff)) return null

  const shareable = isShareable(pathname)
  const settingsModule = settingsModuleFor(pathname)
  // Operator page-content editing (ADR-180) on configured routes — admin+ only.
  const contentModule =
    (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) && meetsAccess('admin', role)
      ? <PageContentModule />
      : null

  // Nothing to administer here — render nothing (no button, no rule).
  if (!shareable && !settingsModule && !contentModule) return null

  return (
    <div className="mb-5 sm:mb-6">
      {/* The divider rule with the Settings control parked at its right end — holds
          regardless of content width (the rule flexes, the button stays right). The
          page header sits above this; the settings section expands below it. */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          Settings
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Settings section — expands under the rule; the page header stays at the top. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {/* A clean white settings surface that runs edge-to-edge within the content
              column (negative margins cancel the page padding). No nested cards. */}
          <div className="mt-3 -mx-4 border-y border-border bg-surface px-4 py-6 sm:-mx-6 sm:px-6">
            <div className={`grid gap-x-10 gap-y-8 ${shareable ? 'lg:grid-cols-[17rem_1fr]' : 'grid-cols-1'}`}>
              {shareable && <SharePanel pathname={pathname} />}
              {(settingsModule || contentModule) && (
                <div className="min-w-0 space-y-6">
                  {settingsModule && (
                    <div>
                      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
                      {settingsModule}
                    </div>
                  )}
                  {contentModule}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Share kit for the current page. The managed QR folder (PageQrManager) lists +
// creates persistent, retargetable codes filed under this page (ADR-179); the copy
// link + open-in-new-tab convenience stays for a quick share without minting a code.
function SharePanel({ pathname }: { pathname: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${pathname}`

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageQrManager pathname={pathname} url={url} />

      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-2xs text-muted" title={url}>
            {url}
          </code>
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <a
          href={pathname}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Open in a new tab
        </a>
      </div>
    </div>
  )
}
