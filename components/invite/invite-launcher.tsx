'use client'

import { useEffect, useState, useTransition } from 'react'
import { UserPlus, X, Link2, Check, Share2, Loader2, Zap, Gem } from 'lucide-react'
import { getInviteLink } from '@/app/(main)/invite-actions'
import { Dialog } from '@/components/ui/dialog'

// Mounts the Invite modal once, app-wide, and opens it on the `open-invite` window
// event — so an "Invite friends" affordance anywhere just dispatches that event.
// The link is the member's personal code (provisioned on demand): when a friend
// joins through it, the member is credited and earns zaps (invite_accepted = 40).
export function InviteLauncher() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ url: string; codeId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setCopied(false)
      if (!data && !pending) {
        start(async () => {
          const r = await getInviteLink()
          if ('error' in r) setError(r.error)
          else setData(r)
        })
      }
    }
    window.addEventListener('open-invite', onOpen)
    return () => window.removeEventListener('open-invite', onOpen)
  }, [data, pending])

  // ESC, the scroll lock, the backdrop, the portal, the focus trap and the dialog semantics now
  // come from `Dialog` (ADR-1100). THIS OVERLAY SET aria-modal="true" WITH NO FOCUS TRAP — telling a
  // screen reader the rest of the page is inert while Tab could still walk straight out of it.
  //
  // It is the ONE overlay of seven surveyed whose scrim and z-tier already matched the primitive
  // exactly (z-[80], bg-ink/60, backdrop-blur-sm, items-stretch -> sm:items-center = align="sheet"),
  // which is why it converts with no visual change at all. The other six each differ in tier, scrim
  // opacity, or both, and are NOT no-ops; see LIVE-089.

  function copy() {
    if (!data) return
    navigator.clipboard?.writeText(data.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function share() {
    if (!data) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Frequency', text: 'Come build community with me on Frequency:', url: data.url })
      } catch { /* user cancelled — fine */ }
    } else {
      copy()
    }
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Invite friends" align="sheet" className="sm:max-w-md">
      <div
        className="relative flex w-full flex-col overflow-y-auto border-border bg-canvas p-4 lift-3 motion-safe:animate-[slideUp_0.25s_ease-out] sm:max-h-[92vh] sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-2 text-body font-bold text-text">
            <UserPlus className="h-5 w-5 text-primary-strong" /> Invite friends
          </p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-pill p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Reward banner */}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-bg/40 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary text-on-primary shadow-pop">
            <Zap className="h-5 w-5" />
          </span>
          <p className="text-body-sm leading-snug text-text">
            Earn <span className="font-bold text-primary-strong">40 <Zap className="inline h-3.5 w-3.5 fill-current" /></span> for every friend who joins through your link, and you’ll be connected automatically.
          </p>
        </div>

        {pending && !data ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-subtle" /></div>
        ) : error ? (
          <p className="py-8 text-center text-body-sm text-danger">{error}</p>
        ) : data ? (
          <>
            {/* QR for in-person */}
            <div className="mt-4 flex justify-center">
              {/* KEEP bg-white: a QR reader needs a true-white quiet zone behind the modules, so this fill is a scanner requirement rather than a themed surface. */}
              <div className="h-44 w-44 overflow-hidden rounded-2xl border border-border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/qr?code=${encodeURIComponent(data.codeId)}&format=png&size=512`} alt="Your invite QR code" className="h-full w-full" />
              </div>
            </div>
            <p className="mt-2 text-center text-2xs text-muted">Point a phone camera at this to join through you.</p>

            {/* Link + actions */}
            <div className="mt-4 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-meta text-muted" title={data.url}>{data.url}</code>
              <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <button type="button" onClick={share} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
              <Share2 className="h-4 w-4" /> Share your invite
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-muted">
              <Gem className="h-3 w-3 text-signal" /> They land on your profile; when they join, you’re connected and the Zaps are yours.
            </p>
          </>
        ) : null}
      </div>
    </Dialog>
  )
}

/** Open the invite modal from anywhere. */
export function openInvite() {
  window.dispatchEvent(new Event('open-invite'))
}
