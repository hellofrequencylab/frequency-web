'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'
import { dismissHostPrompt } from '@/app/(main)/feed/host-prompt-actions'
import { isError } from '@/lib/action-result'
import type { HostPromptKind } from '@/lib/growth/host-prompts'

// The client wrapper for a host prompt: the calm, dismissible chrome around the two
// server-rendered create CTAs (passed as `children` so the server keeps owning the
// Circle/Event gates). The only interactive bit is the "Not now" dismiss — one tap
// hides the card immediately (optimistic) and records the dismissal so it stays quiet
// (lib/growth/host-prompts.ts seen-state). A failed write still hides it for this
// session; the seen meter catches the repeat.
export function HostPromptCardShell({
  kind,
  title,
  body,
  children,
}: {
  kind: HostPromptKind
  title: string
  body: string
  children: ReactNode
}) {
  const [closed, setClosed] = useState(false)
  const [, startTransition] = useTransition()

  if (closed) return null

  function dismiss() {
    setClosed(true) // optimistic: the card leaves the moment the member taps
    startTransition(async () => {
      const result = await dismissHostPrompt(kind)
      // Best-effort: if the write fails the seen cap still quiets it later, so there is
      // nothing to surface back to the member. isError keeps the discriminated result
      // honest for callers that do care.
      void isError(result)
    })
  }

  return (
    <section className="relative rounded-2xl border border-border bg-gradient-to-br from-primary-bg/40 to-signal-bg/30 p-4">
      <button
        type="button"
        aria-label="Not now"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 pr-6">
          <h3 className="text-sm font-bold text-text">{title}</h3>
          <p className="mt-1 text-sm text-muted">{body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </section>
  )
}
