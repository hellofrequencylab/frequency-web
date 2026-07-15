'use client'

// SPOTLIGHT OVERLAY (owner) — opens the member's Spotlight as a full-page overlay over their profile,
// the linktree centered in the middle, with a pinned bottom ACTION TAB (Edit Spotlight + QR & Link)
// that never scrolls away. The spotlight body (SpotlightShell + MemberProfileModules) is server-
// rendered on the profile page and handed in as `children`, so this client shell only owns the open
// state + the action bar; it ships no render engine of its own.
//
// A visitor still gets the plain link to /spotlight/<handle> (a real shareable route); this overlay is
// the OWNER's in-place view + edit + share entry from their own profile.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, Pencil } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { PageQrManager } from '@/components/qr/page-qr-manager'

const TRIGGER_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text'

export function SpotlightOverlay({
  handle,
  profileId,
  label,
  avatarUrl,
  children,
}: {
  handle: string
  /** The owner's profile id — the Edit Spotlight action opens the in-rail builder scoped to it. */
  profileId: string
  /** Trigger label: "Spotlight" once published, "Build Spotlight" before. */
  label: string
  avatarUrl?: string | null
  /** The server-rendered spotlight body (SpotlightShell + MemberProfileModules). */
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const path = `/spotlight/${handle}`
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${path}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER_CLASS}>
        <Sparkles className="h-3.5 w-3.5" />
        {label}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Spotlight">
            {/* Close (returns to the profile) */}
            <div className="flex shrink-0 justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Spotlight"
                className="rounded-full bg-black/30 p-2 text-white transition-colors hover:bg-black/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* The linktree, centered + scrollable. The shell carries its own theme/background. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-md overflow-hidden rounded-t-3xl bg-canvas shadow-2xl">
                {children}
              </div>
            </div>

            {/* Pinned action tab — never scrolls away. */}
            <div className="shrink-0 border-t border-white/10 bg-canvas/95 backdrop-blur px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <div className="mx-auto flex max-w-md items-center gap-2">
                <OpenAdminBarButton
                  scope={{ kind: 'profile', id: profileId }}
                  label="Edit Spotlight"
                  icon={<Pencil className="h-4 w-4" />}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
                />
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <Sparkles className="h-4 w-4" />
                  QR &amp; Link
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Share the SPOTLIGHT url (not the profile). Owner manages their own page → the QR designer. */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} ariaLabel="QR and Link" className="max-w-3xl">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          <PageQrManager pathname={path} url={url} imageUrl={avatarUrl ?? null} />
        </div>
      </Dialog>
    </>
  )
}
