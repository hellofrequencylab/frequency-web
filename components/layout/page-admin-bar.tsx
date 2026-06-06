'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Shield, ChevronDown, QrCode, Link2, Check, ExternalLink } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { AdminConsole } from '@/components/admin/sidebar/admin-console'

// The on-page admin layer (IA restructure → accordion redesign). A slim "Admin ▾"
// bar sits at the top of every operator-visible page; clicking it does NOT open a
// dropdown — it splits the page open IN PLACE (full content width, an interior
// bracket) and slides down to reveal the page's admin DASHBOARD: a share kit
// (QR + link) and the page-aware settings/quick-links console. Operators stay on the
// page. Collapsed by default; auto-collapses on navigation.
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

  return (
    <div className="mb-4">
      {/* Accordion trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 border border-border px-3 py-2 text-xs font-semibold transition-colors ${
          open
            ? 'rounded-t-xl border-b-0 bg-surface-elevated/60 text-text'
            : 'rounded-xl bg-surface-elevated/40 text-muted hover:text-text'
        }`}
      >
        <Shield className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
        Admin
        <span className="font-normal text-subtle">· tools for this page</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Accordion body — splits open full-width within the page and slides down. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="rounded-b-xl border border-t-0 border-border bg-surface-elevated/30 p-4">
            <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
              <SharePanel pathname={pathname} />
              <div className="min-w-0">
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings &amp; tools</p>
                <div className="flex max-h-[55vh] flex-col overflow-hidden rounded-xl border border-border bg-surface">
                  <AdminConsole role={role} staffRole={staffRole} onNavigate={() => setOpen(false)} />
                </div>
              </div>
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
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <QrCode className="h-3.5 w-3.5" /> Share this page
      </p>
      <div className="flex items-center justify-center rounded-lg border border-border bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR code for this page" width={144} height={144} className="h-36 w-36" />
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
