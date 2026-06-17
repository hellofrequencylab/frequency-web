'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Pencil, Eye, Copy, Globe, Lock, Link2, Trash2, Layers, ListChecks, Users, Loader2 } from 'lucide-react'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { setJourneyVisibility, deleteJourney, duplicateJourney } from '@/app/(main)/journeys/actions'

// One row in the "Your Journeys" management space (the admin space for a member's own Journeys).
// Identity + state badges + structure stats + the full action set: edit, view, publish/unpublish,
// duplicate (a private-draft copy), delete. Re-checks ownership server-side in every action.

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
  return { label: 'Draft', cls: 'bg-surface-elevated text-muted' }
}

const VIS = {
  public: { Icon: Globe, label: 'Public' },
  unlisted: { Icon: Link2, label: 'Unlisted' },
  private: { Icon: Lock, label: 'Private' },
} as const

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

export function JourneyManageCard({ plan }: { plan: ManagePlan }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const badge = statusBadge(plan)
  const Vis = VIS[plan.visibility]
  const Icon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon
  const isPublic = plan.visibility === 'public'

  const togglePublish = () =>
    start(async () => {
      setNote(null)
      const res = await setJourneyVisibility(plan.id, isPublic ? 'private' : 'public')
      if (isError(res)) { setNote(res.error); return }
      setNote(
        isPublic
          ? 'Unpublished. It is private again.'
          : res.data.status === 'pending'
            ? 'Sent to the community library for review.'
            : 'Published to the community library.',
      )
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
        <Link href={`/journeys/${plan.slug}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
          <Eye className="h-3.5 w-3.5" /> View
        </Link>
        <button type="button" disabled={pending} onClick={togglePublish} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPublic ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
          {isPublic ? 'Unpublish' : 'Publish'}
        </button>
        <button type="button" disabled={pending} onClick={duplicate} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60">
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
