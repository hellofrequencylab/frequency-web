'use client'

import { useState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { X, Compass, Loader2 } from 'lucide-react'
import { tuneInChannel, tuneOutChannel } from './actions'

// useFormStatus only fires inside a child of a <form>, so we factor the
// actual <button> into its own component. That's what lets the button
// disable itself + show a spinner the instant the form starts submitting,
// killing the "tap again because nothing happened" instinct.
function PendingButton({
  className,
  pendingLabel,
  children,
}: {
  className: string
  pendingLabel: string
  children: React.ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-70 disabled:cursor-wait`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  )
}

// "Tune in". Submits the form and the server action redirects to the
// channel detail page. No modal; the click is the commitment.
export function TuneInButton({
  channelId,
  slug,
  size = 'sm',
}: {
  channelId: string
  slug: string
  size?: 'sm' | 'md'
}) {
  const cls =
    size === 'md'
      ? 'shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors'
      : 'shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-on-primary hover:bg-primary-hover transition-colors'

  return (
    <form action={tuneInChannel.bind(null, channelId, slug)}>
      <PendingButton className={cls} pendingLabel="Tuning in…">
        Tune in
      </PendingButton>
    </form>
  )
}

// "Tuned in". Clicking it opens a modal that frames the exit as a chance
// to discover more channels instead of dropping out. The "Explore more
// channels" CTA is the engagement turn; "Leave channel" is the smaller,
// secondary action so a stray tap doesn't drop the viewer out.
export function TunedInButton({
  channelId,
  channelName,
  size = 'sm',
}: {
  channelId: string
  channelName?: string
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)

  const cls =
    size === 'md'
      ? 'shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:text-danger hover:border-danger transition-colors'
      : 'shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-text hover:text-danger hover:border-danger transition-colors'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cls}
        aria-haspopup="dialog"
      >
        Tuned in
      </button>

      {open && (
        <LeaveChannelDialog
          channelId={channelId}
          channelName={channelName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── The dialog ────────────────────────────────────────────────────────────────

function LeaveChannelDialog({
  channelId,
  channelName,
  onClose,
}: {
  channelId: string
  channelName?: string
  onClose: () => void
}) {
  // Escape to dismiss, body scroll lock while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-channel-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Close */}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-md text-subtle hover:text-text hover:bg-surface-elevated transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <h2
            id="leave-channel-title"
            className="text-base font-bold text-text pr-6 leading-tight"
          >
            Are you sure you want to leave this channel?
          </h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            You&apos;ll stop seeing posts and updates from{' '}
            <span className="font-semibold text-text">
              {channelName ?? 'this channel'}
            </span>
            . If it&apos;s not your thing, there are plenty of others. Try
            something new before you go.
          </p>

          {/* Engagement turn. The primary CTA is exploration, not exit. */}
          <Link
            href="/channels"
            onClick={onClose}
            className="mt-5 flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:bg-primary-hover transition-colors"
          >
            <Compass className="w-4 h-4" />
            Explore more channels
          </Link>

          {/* Quieter exit. Same server action, pending state via
              useFormStatus so a stray double-tap doesn't fire twice. */}
          <form action={tuneOutChannel.bind(null, channelId)} className="mt-2">
            <PendingButton
              className="inline-flex items-center justify-center w-full rounded-lg px-4 py-2.5 text-xs font-medium text-subtle hover:text-danger transition-colors"
              pendingLabel="Leaving…"
            >
              Yes, leave the channel
            </PendingButton>
          </form>
        </div>
      </div>
    </div>
  )
}
