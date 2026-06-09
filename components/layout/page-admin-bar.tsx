'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, QrCode, Link2, Check, ExternalLink } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'

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

  // Nothing to administer here — render nothing (no button, no rule).
  if (!shareable && !settingsModule) return null

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
            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[17rem_1fr]">
              {shareable && <SharePanel pathname={pathname} />}
              {settingsModule && (
                <div className="min-w-0">
                  <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
                  {settingsModule}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Share kit for the current page — a QR + the link, generated on the fly. The QR
// route is auth-guarded + same-site-only; operators are signed in, so the same-origin
// <img> request carries the session.
function SharePanel({ pathname }: { pathname: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${pathname}`
  const qrSrc = `/api/qr?text=${encodeURIComponent(pathname)}&format=png&size=512`

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="min-w-0">
      <p className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <QrCode className="h-3.5 w-3.5" /> Share this page
      </p>
      <div className="flex items-center justify-center rounded-xl border border-border bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR code for this page" width={160} height={160} className="h-40 w-40" />
      </div>
      <div className="mt-3 flex items-center gap-2">
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
  )
}
