'use client'

import { useState } from 'react'
import { Gift, Check, Copy, Download, Share2, X, Loader2 } from 'lucide-react'
import { downloadStyledQrPng } from '@/lib/qr/client-download'

// THE "INVITE A FRIEND" CTA + POPUP for the right rail (under Report a bug). A member's PERSONAL code IS
// their invite link: scanning / opening it drops the referrer cookie, and when the friend joins and gets
// started the member earns Zaps (invite_accepted). So this reuses the same connect code the Edit Profile QR
// card shows, just framed as an invite. The button is a small warm CTA; the popup carries the branded QR, the
// link with copy, a native share, and a PNG download. Semantic tokens only; voice canon (no em dashes).
export function InviteFriendButton({
  svg,
  link,
  codeId,
}: {
  /** The member's branded connect-code QR, pre-rendered server-side (avatar inlined). */
  svg: string
  /** The short invite URL (shortLinkUrl of the connect code). */
  link: string
  /** The qr_codes row id, for the /api/qr PNG download that matches the shown style. */
  codeId: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pngBusy, setPngBusy] = useState(false)
  const api = `/api/qr?code=${encodeURIComponent(codeId)}`

  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function share() {
    // Native share sheet where available (mobile); otherwise fall back to copying the link.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Frequency', text: 'Come find your people on Frequency.', url: link })
        return
      } catch {
        // user dismissed the sheet, or it is unavailable — fall through to copy
      }
    }
    copy()
  }

  async function downloadPng() {
    if (pngBusy) return
    setPngBusy(true)
    try {
      await downloadStyledQrPng(api, 'my-invite-code')
    } finally {
      setPngBusy(false)
    }
  }

  return (
    <>
      {/* The CTA — a small warm invite pill, pinned right under Report a bug. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-2.5 rounded-xl border border-primary/30 bg-primary-bg/50 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary-bg"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-transform group-hover:scale-105">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-text">Invite a friend</span>
          <span className="block text-2xs font-medium text-primary-strong">Earn Zaps when they join ⚡</span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invite a friend"
        >
          {/* Backdrop — click to dismiss. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-ink/50 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <div className="flex flex-col items-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-on-primary">
                <Gift className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-lg font-bold text-text">Invite a friend, earn Zaps</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Share your link or code. When a friend joins Frequency and gets started, you earn Zaps ⚡
              </p>

              {/* The branded QR (avatar in the middle), pre-rendered server-side. */}
              <div
                className="mt-4 h-44 w-44 overflow-hidden rounded-xl border border-border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />

              {/* The link + copy. */}
              <div className="mt-4 flex w-full items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-2 text-left font-mono text-xs text-muted"
                  title={link}
                >
                  {link}
                </code>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Share + download. */}
              <div className="mt-2 flex w-full gap-2">
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> Share
                </button>
                <button
                  type="button"
                  onClick={downloadPng}
                  disabled={pngBusy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
                >
                  {pngBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                  <span className="sr-only sm:not-sr-only">PNG</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
