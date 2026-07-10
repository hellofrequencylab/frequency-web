'use client'

import { useEffect, useState, useTransition } from 'react'
import { UserPlus, X, Link2, Check, Share2, Loader2, Zap, Gem } from 'lucide-react'
import { getInviteLink } from '@/app/(main)/invite-actions'

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

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite friends"
        className="relative flex w-full flex-col overflow-y-auto border-border bg-canvas p-4 shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out] sm:max-h-[92vh] sm:max-w-md sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-2 text-base font-bold text-text">
            <UserPlus className="h-5 w-5 text-primary-strong" /> Invite friends
          </p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Reward banner */}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-bg/40 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop">
            <Zap className="h-5 w-5" />
          </span>
          <p className="text-sm leading-snug text-text">
            Earn <span className="font-bold text-primary-strong">40 <Zap className="inline h-3.5 w-3.5 fill-current" /></span> for every friend who joins through your link, and you’ll be connected automatically.
          </p>
        </div>

        {pending && !data ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-subtle" /></div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-danger">{error}</p>
        ) : data ? (
          <>
            {/* QR for in-person */}
            <div className="mt-4 flex justify-center">
              <div className="h-44 w-44 overflow-hidden rounded-2xl border border-border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/qr?code=${encodeURIComponent(data.codeId)}&format=png&size=512`} alt="Your invite QR code" className="h-full w-full" />
              </div>
            </div>
            <p className="mt-2 text-center text-2xs text-subtle">Point a phone camera at this to join through you.</p>

            {/* Link + actions */}
            <div className="mt-4 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-muted" title={data.url}>{data.url}</code>
              <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <button type="button" onClick={share} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
              <Share2 className="h-4 w-4" /> Share your invite
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-subtle">
              <Gem className="h-3 w-3 text-signal" /> They land on your profile; when they join, you’re connected and the Zaps are yours.
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Open the invite modal from anywhere. */
export function openInvite() {
  window.dispatchEvent(new Event('open-invite'))
}
