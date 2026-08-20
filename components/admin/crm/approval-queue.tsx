// APPROVAL QUEUE — the review-and-arm surface for the approval spine (LIVE-058), composed
// into the CRM Marketing tab (the route the spine's revalidatePaths point at). Server
// Component: it reads ONLY through the spine's exported reads (lib/outbound/approvals.ts,
// fail-safe to []) and mutates ONLY through the thin server actions in
// app/(main)/admin/crm/marketing/actions.ts, which delegate to the spine's self-gated,
// audited transitions. It never touches outboundDb or a Supabase client directly; the
// shape test beside it (approval-queue.test.ts) pins that.
//
// WHAT IS IN THE QUEUE (the honest read):
//   • everything `ready` — marked finished and up for review, awaiting the arm/hold/kill
//     decision (listReadyForApproval's definition);
//   • everything `paused` — a hold IS an open decision (the spine calls pause reversible),
//     and the queue is the only surface that can approve or cancel one, so a paused row
//     that left the queue would be stranded with no way back;
//   • plus phase-filed DRAFT strays: rows still carrying a phase_id from the retired Beta
//     Command Center. Nothing writes phase_id any more, so without this surface those
//     rows could never clear assertApproved again. A draft here gets a "Send to review"
//     affordance (markReady) so it takes the same review path as everything else.
//     Ordinary null-phase drafts stay out: they live in the workspace below until an
//     operator finishes them.
//
// An EMPTY queue is the surface's NORMAL state, so the empty state is the calm `cleared`
// variant, not an alarm. The only client JS is ConfirmSubmitButton on the arming and
// killing actions (a stray click must not arm a send). Voice canon: no em dashes.

import { Suspense } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button'
import { listReadyForApproval, listOutboundByStatus, type OutboundItem } from '@/lib/outbound/approvals'
import {
  approveCampaignAction,
  pauseCampaignAction,
  cancelCampaignAction,
  markReadyCampaignAction,
} from '@/app/(main)/admin/crm/marketing/actions'

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  ready: { label: 'Ready to review', tone: 'warning' },
  draft: { label: 'Draft', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** ready first (a decision is waiting), then the phase-filed strays; newest first within each. */
export function orderQueue(items: OutboundItem[]): OutboundItem[] {
  const stamp = (i: OutboundItem) => (i.createdAt ? Date.parse(i.createdAt) || 0 : 0)
  return [...items].sort((a, b) => {
    const aReady = a.approvalStatus === 'ready' ? 0 : 1
    const bReady = b.approvalStatus === 'ready' ? 0 : 1
    if (aReady !== bReady) return aReady - bReady
    return stamp(b) - stamp(a)
  })
}

function QueueRow({ item }: { item: OutboundItem }) {
  const badge = STATUS_BADGE[item.approvalStatus] ?? { label: item.approvalStatus, tone: 'neutral' as BadgeTone }
  const when = formatWhen(item.createdAt)
  const meta = [
    item.segment ? `Segment: ${item.segment}` : null,
    item.count != null ? `${item.count} recipient${item.count === 1 ? '' : 's'}` : null,
    when ? `Created ${when}` : null,
  ].filter(Boolean)
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate font-medium text-text">{item.label}</p>
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
            {item.phaseId && (
              <Badge tone="neutral" size="sm" title={`Filed under phase ${item.phaseId}`}>
                Phase-filed
              </Badge>
            )}
          </div>
          {meta.length > 0 && <p className="mt-1 text-2xs text-muted">{meta.join(' · ')}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {item.approvalStatus === 'draft' ? (
            <form action={markReadyCampaignAction.bind(null, item.id)}>
              <ConfirmSubmitButton
                confirm="Put this draft up for review? It moves to the queue as ready, still unable to send until you approve it."
                label="Send to review"
                variant="secondary"
              />
            </form>
          ) : (
            <form action={approveCampaignAction.bind(null, item.id)}>
              <ConfirmSubmitButton
                confirm="Approve this email? Approving arms it: the send gate clears and it can go out."
                label="Approve"
                variant="primary"
              />
            </form>
          )}
          {item.approvalStatus === 'ready' && (
            <form action={pauseCampaignAction.bind(null, item.id)}>
              <ConfirmSubmitButton confirm="Pause this email? It stays here on hold until you decide." label="Pause" />
            </form>
          )}
          <form action={cancelCampaignAction.bind(null, item.id)}>
            <ConfirmSubmitButton
              confirm="Cancel this email for good? A cancelled email never sends and cannot come back."
              label="Cancel"
            />
          </form>
        </div>
      </div>
    </div>
  )
}

async function ApprovalQueueBody() {
  // Three fail-safe reads through the spine (each returns [] on any error), so this
  // panel can never take the page down. Every ready and paused row joins the queue;
  // drafts join only when they still carry a phase_id (the stranded rows LIVE-058
  // exists for).
  const [ready, drafts, paused] = await Promise.all([
    listReadyForApproval(),
    listOutboundByStatus('draft'),
    listOutboundByStatus('paused'),
  ])
  const strayDrafts = drafts.filter((i) => i.phaseId != null)
  const items = orderQueue([...ready, ...paused, ...strayDrafts])

  if (items.length === 0) {
    return (
      <EmptyState
        variant="cleared"
        title="Nothing is waiting on you"
        description="Emails marked ready for review line up here. Approval is the only thing that lets one send."
      />
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <QueueRow key={`${item.type}:${item.id}`} item={item} />
      ))}
    </div>
  )
}

/** The panel the CRM Marketing page composes. Suspense keeps the page shell unblocked
 *  (PAGE-FRAMEWORK §5); the empty queue is the normal state, so the fallback is quiet. */
export function ApprovalQueue() {
  return (
    <Suspense fallback={null}>
      <ApprovalQueueBody />
    </Suspense>
  )
}
