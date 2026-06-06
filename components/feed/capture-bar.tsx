'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Camera, NotebookPen, PenLine, ScanLine, ArrowLeft, X } from 'lucide-react'
import { Composer } from './composer'

// Capture — the primary "log a moment" entry (ADR-155 the Portal Loop, ADR-156).
// Replaces the always-open inline composer: one branded button opens a mode picker
// (the camera-icon vibe), and posting becomes one mode inside Capture. Each mode is
// a way to log life as it goes by and feed it to the community story.
//   • Photo  → composer with the image picker primed
//   • Note   → a quiet text journal entry (post_type='note')
//   • Post   → the full composer
//   • In-Person → the built card/poster capture (/connections/new) — "stop and trade
//                 info with a new friend," every member an access point.

type View = 'closed' | 'menu' | 'post' | 'photo' | 'note'

export type CaptureMode = 'photo' | 'note' | 'post' | 'in_person'

// Shared so the feed bar and the global Capture launcher (capture-launcher.tsx)
// can never drift out of sync on the modes they offer.
export const CAPTURE_MODES: { key: CaptureMode; icon: typeof Camera; label: string; hint: string; href?: string }[] = [
  { key: 'photo', icon: Camera, label: 'Photo', hint: 'Snap the moment you’re in' },
  { key: 'note', icon: NotebookPen, label: 'Note', hint: 'Jot a quick journal entry' },
  { key: 'post', icon: PenLine, label: 'Post', hint: 'Say something to your people' },
  { key: 'in_person', icon: ScanLine, label: 'In person', hint: 'Capture a card or poster', href: '/connections/new' },
]

export function CaptureBar({
  scopeId,
  visibility = 'group',
  placeholder = 'What’s on your mind?',
  canAnnounce = false,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
}) {
  const [view, setView] = useState<View>('closed')

  // ── A mode is live: render the composer with a way back to the picker. ──────
  if (view === 'post' || view === 'photo' || view === 'note') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('menu')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Capture
          </button>
          <button
            type="button"
            onClick={() => setView('closed')}
            aria-label="Close"
            className="rounded-full p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <Composer
          scopeId={scopeId}
          visibility={visibility}
          canAnnounce={canAnnounce}
          kind={view === 'note' ? 'note' : 'post'}
          autoImage={view === 'photo'}
          placeholder={view === 'note' ? 'Jot a note — what happened, what you noticed…' : placeholder}
        />
      </div>
    )
  }

  // ── The picker. ─────────────────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-text">Capture a moment</p>
          <button
            type="button"
            onClick={() => setView('closed')}
            aria-label="Close"
            className="rounded-full p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CAPTURE_MODES.map((m) => {
            const inner = (
              <>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                  <m.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{m.label}</span>
                  <span className="block truncate text-xs text-muted">{m.hint}</span>
                </span>
              </>
            )
            const cls =
              'flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-broadcast hover:bg-broadcast-bg/30'
            return m.href ? (
              <Link key={m.key} href={m.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={m.key} type="button" onClick={() => setView(m.key as View)} className={cls}>
                {inner}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Collapsed: the one inviting button. ─────────────────────────────────────
  return (
    <button
      type="button"
      onClick={() => setView('menu')}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors hover:border-broadcast hover:bg-broadcast-bg/20"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-broadcast text-on-broadcast transition-transform group-hover:scale-105">
        <Camera className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-text">Capture a moment</span>
        <span className="block text-xs text-muted">Photo · note · post · trade info in person</span>
      </span>
    </button>
  )
}
