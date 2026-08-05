'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flag,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Route as RouteIcon,
  Smartphone,
  Sparkles,
  StickyNote,
  Users,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/crm/timeline'
// Type-only imports: the assembler module is pure, but keep the client bundle to types.
import type { MessagePath, PathEntry, PathEventRef, PathThread } from '@/lib/crm/message-path'
import type { Milestone } from '@/lib/crm/member-network'

// THE PATH FOLD-DOWN (CRM Everywhere plan 2.5 / ADR-827 ruling 3). The member detail pane's message
// history: COLLAPSED by default to one line (the latest touch), expanding to the thread-grouped
// history the pure assembler built server-side. Every entry names the website event it was tied to
// (linked when there is a safe route). The old MAJOR-milestone rail is not gone — it survives as the
// Milestones strip INSIDE the fold. Altitude is already enforced in the data (the assembler's scope
// filter), so this renders whatever it is handed and nothing else.
//
// Composed from the kit: semantic tokens only, no hex, no text-[10px]; copy is plain, no em dashes
// (docs/CONTENT-VOICE.md).

const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  sms: Smartphone,
  call: Phone,
  in_app: MessageCircle,
  in_person: Users,
  event: CalendarDays,
  note: StickyNote,
  system: Zap,
}

/** The channel glyph, resolved from the static map (never created during render). */
function ChannelIcon({ channel, className }: { channel: string; className: string }) {
  const Icon = CHANNEL_ICON[channel] ?? MessageSquare
  return <Icon className={className} aria-hidden />
}

/** The tied website event, named. A link when the ref resolved to a safe route. */
function EventRefBadge({ refInfo }: { refInfo: PathEventRef }) {
  const inner = (
    <>
      <Flag className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{refInfo.label}</span>
    </>
  )
  const chip =
    'inline-flex max-w-full items-center gap-1 rounded-pill border border-primary/30 bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong'
  if (refInfo.href) {
    return (
      <Link href={refInfo.href} className={cn(chip, 'hover:border-primary/60')} onClick={(e) => e.stopPropagation()}>
        {inner}
      </Link>
    )
  }
  return <span className={chip}>{inner}</span>
}

/** The relocated MAJOR-milestone rail, now a strip inside the fold. Renders nothing when empty. */
function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">Milestones</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {milestones.map((m, i) => (
          <li
            key={`${m.kind}-${m.at}-${i}`}
            className="flex shrink-0 items-center gap-1.5 rounded-pill border border-border bg-surface-elevated px-2.5 py-1"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-primary-strong" aria-hidden />
            <span className="whitespace-nowrap text-2xs font-medium text-text">{m.title}</span>
            {m.detail && <span className="whitespace-nowrap text-2xs text-muted">{m.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One message inside an expanded thread. */
function EntryRow({ entry }: { entry: PathEntry }) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[21px] top-1.5 h-2 w-2 rounded-pill',
          entry.direction === 'inbound' ? 'bg-success' : 'bg-primary',
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ChannelIcon channel={entry.channel} className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="text-meta font-semibold text-text">{entry.sender}</span>
        <span className="text-2xs text-muted">{relativeTime(entry.at) || ''}</span>
        {entry.ref && <EventRefBadge refInfo={entry.ref} />}
      </div>
      <p className="mt-0.5 text-meta text-muted">{entry.snippet || entry.title}</p>
    </li>
  )
}

/** One thread: a single-touch thread renders inline; a multi-message thread expands on tap. */
function ThreadRow({ thread }: { thread: PathThread }) {
  const [open, setOpen] = useState(false)
  const solo = thread.count === 1
  const meta = [thread.channel.replace('_', ' '), solo ? null : `${thread.count} msgs`, relativeTime(thread.lastAt) || null]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="rounded-card border border-border bg-surface-elevated/50">
      <button
        type="button"
        onClick={() => !solo && setOpen((v) => !v)}
        aria-expanded={solo ? undefined : open}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left',
          !solo && 'transition-colors hover:bg-surface-elevated',
        )}
      >
        <ChannelIcon channel={thread.channel} className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-body-sm font-medium text-text">{thread.subject}</span>
            {thread.ref && <EventRefBadge refInfo={thread.ref} />}
          </span>
          <span className="mt-0.5 block text-2xs text-muted">{meta}</span>
          {solo && thread.entries[0]?.snippet && (
            <span className="mt-0.5 block text-meta text-muted">{thread.entries[0].snippet}</span>
          )}
        </span>
        {!solo && (
          <ChevronDown
            className={cn('mt-1 h-4 w-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        )}
      </button>
      {!solo && open && (
        <ol className="ml-5 space-y-3 border-l border-border py-3 pl-4 pr-3">
          {thread.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * The fold. Collapsed: one line summarizing the latest touch (or how quiet things are). Expanded:
 * the Milestones strip, then the threaded history. `path` undefined = the viewer's lane carries no
 * message history (a leader lane without comms); the fold still opens to the milestones.
 * `defaultOpen` starts the fold expanded — the scoped surfaces (event / circle / space) lead with
 * the conversation history per the owner directive; the platform pane starts collapsed.
 */
export function MessagePathFold({
  path,
  milestones = [],
  defaultOpen = false,
}: {
  path?: MessagePath
  milestones?: Milestone[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const threads = path?.threads ?? []
  const latest = path?.latest ?? null
  const total = path?.totalEntries ?? 0
  const hasAnything = threads.length > 0 || milestones.length > 0
  if (!hasAnything && !path) return null

  const summary = latest
    ? [latest.title, latest.ref?.label, relativeTime(latest.at) || null].filter(Boolean).join(' · ')
    : milestones.length > 0
      ? 'No messages yet. Milestones inside.'
      : 'No messages yet.'

  return (
    <section className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/60"
      >
        <RouteIcon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <span className="text-body-sm font-bold tracking-tight text-text">The Path</span>
        {total > 0 && <span className="text-meta font-medium tabular-nums text-subtle">{total}</span>}
        <span className="min-w-0 flex-1 truncate text-right text-2xs text-muted">{summary}</span>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 text-subtle transition-transform', open && 'rotate-90')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <MilestoneStrip milestones={milestones} />
          {threads.length > 0 ? (
            <ul className="space-y-2">
              {threads.map((t) => (
                <ThreadRow key={t.key} thread={t} />
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-meta text-subtle">
              No messages in this lane yet. Send one and it shows up here.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
