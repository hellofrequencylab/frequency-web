import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listMyCreateProposals } from '@/lib/ai/vera/create-entity'
import { NO_COMMIT_REASON } from '@/lib/ai/vera/create-commits'
import { savedAgoLabel, DRAFT_TTL_MS } from '@/components/studio/spark/draft/draft-store'
import { listStagedDrafts } from '@/lib/studio/draft-store'
import { listMyUnfinishedEventDrafts } from '@/lib/events/event-drafts'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { DraftRow } from './draft-row'
import { UnfinishedDraftRow, type UnfinishedDraftView } from './unfinished-row'
import { EventDraftRow, type EventDraftView } from './event-draft-row'

// ─────────────────────────────────────────────────────────────────────────────
// DRAFTS — the member-visible side of a governed create proposal (ADR-998).
//
// ADR-988 shipped a create layer that writes a `studio_create` row at status 'proposed' and then
// gave nobody anywhere to read it. So a draft Vera made for you expired in silence, and the audit
// trail the autonomy ladder is supposed to be earned against filled with proposals that were never
// confirmed because they could not be. This page is the missing half: a list, and two decisions.
//
// Nothing on this page exists yet. That is the point of it: a proposal is a thing somebody drew up
// for you to look at, and it becomes real only when you tap Create in your own session.
//
// THREE KINDS, ONE LIST (ADR-1001, extended by the owner ruling of 2026-08-12). Alongside the
// proposals sit the wizard drafts an author started and stepped away from, staged in `studio_draft`
// so they follow the author across devices, and the events a member captured off a poster and has
// not posted yet. The difference between "Vera drew this up", "you typed this" and "you
// photographed this" is our implementation detail; to a member all three are "things I started and
// have not finished", so they share a page and are told apart by a badge on the row.
//
// THE THIRD KIND CLOSED A REAL COLLISION. `/events/drafts` was a second member surface calling
// itself "My drafts" about something else entirely, reached from the Events header and the scan
// page, while nothing on it was reachable from here. Two Drafts surfaces is worse than either
// alone, which is the same argument ADR-1001 already made about the first two. `/events/drafts`
// now redirects here; the per-event editor at `/events/drafts/<id>` is unchanged and is where a
// row's primary control still leads. docs/NAMING.md pins Drafts to this one surface.
//
// FINISHED THINGS ARE NOT DRAFTS. Only captured events still at status 'draft' come here. Once a
// member posts one it is made, and it lives in their own listing on `/events` (which reads
// `host_id OR posted_by_profile_id`, so an unclaimed posted event is in it) and on the operator
// board at `/admin/events`. A page whose heading says nothing here is made yet must not list
// things that are.
//
// This page is also the member's ERASURE surface for the staged answers (the ai_member_context
// posture, docs/AI-VERA.md section 5): what we hold is visible here and one tap removes it.
//
// STREAMING (PAGE-FRAMEWORK §5.3). The header renders from the session alone; the three reads sit
// behind one Suspense boundary so the shell never waits on them. They run in parallel inside it,
// so the wait is the slowest read rather than the sum of three.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Drafts' }

const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** A dimension-matched stand-in for the list, so streaming in the real rows shifts nothing. */
function DraftsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-2xl" />
      ))}
    </div>
  )
}

async function DraftsList({ profileId }: { profileId: string }) {
  const [proposals, staged, eventDrafts] = await Promise.all([
    listMyCreateProposals(),
    listStagedDrafts(profileId),
    listMyUnfinishedEventDrafts(profileId),
  ])

  // The answers themselves are never rendered, only counted. A half-typed Journey is the author's
  // own working note, and a list is the wrong place to read it back at them.
  const unfinished: UnfinishedDraftView[] = staged.map((d) => ({
    scope: d.scope,
    label: d.label ?? 'Something you started',
    route: d.route,
    answerCount: Object.keys(d.values).length,
    savedLabel: savedAgoLabel(d.savedAt),
    keptUntilLabel: `Kept until ${new Date(d.savedAt + DRAFT_TTL_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  }))

  // One batched signing call for every cover thumb (the cover crop, else the poster), and only
  // when there is something to sign — a member with no captured events pays nothing for this.
  const thumbPath = (d: (typeof eventDrafts)[number]): string | null =>
    (d.details as EventDetailsWithMedia).media?.coverPath ?? d.posterPath
  const signed = await posterSignedUrlMap(
    eventDrafts.map(thumbPath).filter((p): p is string => !!p),
  )
  const captured: EventDraftView[] = eventDrafts.map((d) => {
    const path = thumbPath(d)
    return {
      id: d.id,
      title: d.title ?? 'Untitled event',
      thumbUrl: (path ? signed.get(path) : null) ?? null,
      whenLabel: d.startsAt ? dayLabel(d.startsAt) : 'No date yet',
      location: d.location,
    }
  })

  if (proposals.length === 0 && unfinished.length === 0 && captured.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No drafts waiting"
        description="Anything you start lands here and waits: a draft Vera made for you, a form you stepped away from, a poster you captured around town."
      />
    )
  }

  return (
    <ul className="space-y-3">
      {proposals.map((p) => (
        <DraftRow key={p.proposalId} proposal={p} noCommitReason={NO_COMMIT_REASON[p.entity] ?? null} />
      ))}
      {unfinished.map((d) => (
        <UnfinishedDraftRow key={d.scope} draft={d} />
      ))}
      {captured.map((d) => (
        <EventDraftRow key={d.id} draft={d} />
      ))}
    </ul>
  )
}

export default async function DraftsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  return (
    <IndexTemplate
      title="Drafts"
      description="Things you started, and things drawn up for you to look at. Nothing here is made yet, and nothing gets made until you say so."
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/drafts', label: 'Drafts' },
      ]}
    >
      <Suspense fallback={<DraftsSkeleton />}>
        <DraftsList profileId={profileId} />
      </Suspense>
    </IndexTemplate>
  )
}
