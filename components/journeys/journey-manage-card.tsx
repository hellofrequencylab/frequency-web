'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Pencil, Eye, Copy, Globe, Lock, Link2, Trash2, Layers, ListChecks, Users, Loader2,
  ChevronDown, Check, Building2, User, ArrowLeftRight,
} from 'lucide-react'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import {
  setJourneyVisibility,
  deleteJourney,
  duplicateJourney,
  reassignJourneyOwner,
  listJourneyOwnerTargets,
  type JourneyOwnerTarget,
} from '@/app/(main)/journeys/actions'

// One row in the "Your Journeys" management space (both the personal /journeys/mine and a Space's
// own manager). Identity + state badges + structure stats + the full action set: edit, view,
// visibility (draft / live in space / listed in library), MOVE the owner (personal <-> a Space you
// run), duplicate, delete. Every action re-checks authorization server-side.

export interface ManagePlan {
  id: string
  slug: string
  title: string
  summary: string | null
  emoji: string | null
  accent: string | null
  coverImage: string | null
  visibility: 'private' | 'unlisted' | 'public'
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  adoptCount: number
  updatedAt: string
  phaseCount: number
  stepCount: number
}

/** The member-facing state of a Journey, from visibility + moderation status. */
function statusBadge(p: ManagePlan): { label: string; cls: string } {
  if (p.status === 'rejected') return { label: 'Needs changes', cls: 'bg-danger-bg text-danger' }
  if (p.visibility === 'public') {
    return p.status === 'pending'
      ? { label: 'In review', cls: 'bg-warning-bg text-warning' }
      : { label: 'Live', cls: 'bg-success-bg text-success' }
  }
  if (p.visibility === 'unlisted') return { label: 'Live in space', cls: 'bg-success-bg text-success' }
  return { label: 'Draft', cls: 'bg-surface-elevated text-muted' }
}

const VIS = {
  public: { Icon: Globe, label: 'Public' },
  unlisted: { Icon: Link2, label: 'Unlisted' },
  private: { Icon: Lock, label: 'Private' },
} as const

/** The three visibility states an owner can pick, with plain, no-em-dash copy (CONTENT-VOICE). */
const VIS_OPTIONS: { value: ManagePlan['visibility']; Icon: typeof Globe; label: string; hint: string }[] = [
  { value: 'private', Icon: Lock, label: 'Draft', hint: 'Only you can see it.' },
  { value: 'unlisted', Icon: Link2, label: 'Live in your space', hint: 'Members and anyone with the link.' },
  { value: 'public', Icon: Globe, label: 'Listed in the library', hint: 'In public discovery.' },
]

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

/** A small popover menu anchored to a trigger button. Closes on outside click (a full-screen
 *  transparent backdrop) or Escape. Presentational shell reused by the visibility + move menus. */
function Menu({
  open,
  onClose,
  trigger,
  children,
}: {
  open: boolean
  onClose: () => void
  trigger: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {trigger}
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className="fixed inset-0 z-40 cursor-default" />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-lg"
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export function JourneyManageCard({ plan }: { plan: ManagePlan }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [visOpen, setVisOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  // Owner targets are lazy-loaded when the Move menu first opens (keeps the manager pages dumb).
  const [targets, setTargets] = useState<{ current: string; targets: JourneyOwnerTarget[] } | null>(null)
  const [targetsLoading, setTargetsLoading] = useState(false)
  const badge = statusBadge(plan)
  const Vis = VIS[plan.visibility]
  const Icon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon
  const isPublic = plan.visibility === 'public'

  const setVisibility = (target: ManagePlan['visibility']) =>
    start(async () => {
      setNote(null)
      setVisOpen(false)
      if (target === plan.visibility) return
      const res = await setJourneyVisibility(plan.id, target)
      if (isError(res)) { setNote(res.error); return }
      setNote(
        target === 'private'
          ? 'Moved back to a draft.'
          : target === 'unlisted'
            ? 'Live in your space. Members and anyone with the link can open it.'
            : res.data.status === 'pending'
              ? 'Sent to the community library for review.'
              : 'Listed in the community library.',
      )
      router.refresh()
    })

  const openMove = () => {
    setMoveOpen((o) => !o)
    setNote(null)
    if (!targets && !targetsLoading) {
      setTargetsLoading(true)
      listJourneyOwnerTargets(plan.id)
        .then((res) => { if (!isError(res)) setTargets(res.data) })
        .finally(() => setTargetsLoading(false))
    }
  }

  const move = (target: string) =>
    start(async () => {
      setNote(null)
      setMoveOpen(false)
      if (targets && target === targets.current) return
      const res = await reassignJourneyOwner(plan.id, target)
      if (isError(res)) { setNote(res.error); return }
      const label = targets?.targets.find((t) => t.id === target)?.label ?? 'its new owner'
      setNote(`Moved to ${label}.`)
      setTargets(null) // force a refetch of the current owner next open
      router.refresh()
    })

  const duplicate = () =>
    start(async () => {
      setNote(null)
      const res = await duplicateJourney(plan.id)
      if (isError(res)) { setNote(res.error); return }
      router.push(`/journeys/${res.data.slug}/edit`)
    })

  const remove = () =>
    start(async () => {
      const res = await deleteJourney(plan.id)
      if (!isError(res)) router.refresh()
    })

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60'

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {plan.coverImage ? (
          // Unoptimized: user-controlled Supabase Storage host, not a configured next/image domain.
          <Image src={plan.coverImage} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/journeys/${plan.slug}/edit`} className="truncate text-base font-bold text-text hover:text-primary-strong">
              {plan.title}
            </Link>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${badge.cls}`}>{badge.label}</span>
          </div>
          {plan.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{plan.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-subtle">
            <span className="inline-flex items-center gap-1"><Vis.Icon className="h-3 w-3" /> {Vis.label}</span>
            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {plan.phaseCount} {plan.phaseCount === 1 ? 'phase' : 'phases'}</span>
            <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {plan.stepCount} {plan.stepCount === 1 ? 'step' : 'steps'}</span>
            {isPublic && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {plan.adoptCount.toLocaleString()}</span>}
            <span>Updated {relativeTime(plan.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <Link href={`/journeys/${plan.slug}/edit`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        <Link href={`/journeys/${plan.slug}`} className={btn}>
          <Eye className="h-3.5 w-3.5" /> View
        </Link>

        {/* Visibility — draft / live in your space (unlisted) / listed in the library (public). */}
        <Menu
          open={visOpen}
          onClose={() => setVisOpen(false)}
          trigger={
            <button type="button" disabled={pending} onClick={() => { setVisOpen((o) => !o); setNote(null) }} className={btn}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Vis.Icon className="h-3.5 w-3.5" />}
              Visibility <ChevronDown className="h-3 w-3 text-subtle" />
            </button>
          }
        >
          {VIS_OPTIONS.map((o) => {
            const active = o.value === plan.visibility
            return (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => setVisibility(o.value)}
                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-60 ${active ? 'bg-surface-elevated' : ''}`}
              >
                <o.Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                    {o.label} {active && <Check className="h-3.5 w-3.5 text-success" aria-hidden />}
                  </span>
                  <span className="block text-2xs text-muted">{o.hint}</span>
                </span>
              </button>
            )
          })}
        </Menu>

        {/* Move — reassign the owner between the caller's personal account and a Space they run. */}
        <Menu
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          trigger={
            <button type="button" disabled={pending} onClick={openMove} className={btn}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> Move <ChevronDown className="h-3 w-3 text-subtle" />
            </button>
          }
        >
          <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Show this journey on</p>
          {targetsLoading && (
            <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading</p>
          )}
          {targets?.targets.map((t) => {
            const active = t.id === targets.current
            const TIcon = t.kind === 'personal' ? User : Building2
            return (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => move(t.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-elevated disabled:opacity-60 ${active ? 'bg-surface-elevated' : ''}`}
              >
                <TIcon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-text">{t.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />}
              </button>
            )
          })}
          {targets && targets.targets.length <= 1 && (
            <p className="px-2.5 py-2 text-2xs text-muted">Run a Space to move this journey onto its page.</p>
          )}
        </Menu>

        <button type="button" disabled={pending} onClick={duplicate} className={btn}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-bg/40 disabled:opacity-60">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}

      <DangerModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete journey"
        body={
          <>
            This permanently removes <span className="font-semibold text-text">{plan.title}</span>, its phases, steps, and
            everyone&apos;s progress. This cannot be undone.
          </>
        }
        confirmLabel="Delete journey"
        requireTyping={plan.title}
        onConfirm={remove}
      />
    </div>
  )
}
