import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { listMyCreateProposals } from '@/lib/ai/vera/create-entity'
import { NO_COMMIT_REASON } from '@/lib/ai/vera/create-commits'
import { savedAgoLabel, DRAFT_TTL_MS } from '@/components/studio/spark/draft/draft-store'
import { listStagedDrafts } from '@/lib/studio/draft-store'
import { DraftRow } from './draft-row'
import { UnfinishedDraftRow, type UnfinishedDraftView } from './unfinished-row'

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
// TWO KINDS, ONE LIST (ADR-1001). Alongside the proposals sit the wizard drafts an author started
// and stepped away from, staged in `studio_draft` so they follow the author across devices. The
// difference between "Vera drew this up" and "you typed this" is our implementation detail; to a
// member both are "things I started and have not finished", so they share a page and are told
// apart by a badge on the row. Splitting them across two surfaces both called Drafts would be
// worse than either alone.
//
// This page is also the member's ERASURE surface for the staged answers (the ai_member_context
// posture, docs/AI-VERA.md section 5): what we hold is visible here and one tap removes it.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Drafts' }

export default async function DraftsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const [proposals, staged] = await Promise.all([
    listMyCreateProposals(),
    listStagedDrafts(profileId),
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

  return (
    <IndexTemplate
      title="Drafts"
      description="Things you started, and things drawn up for you to look at. Nothing here is made yet, and nothing gets made until you say so."
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/drafts', label: 'Drafts' },
      ]}
    >
      {proposals.length === 0 && unfinished.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No drafts waiting"
          description="When Vera drafts something for you, or you start something and step away, it waits here until you come back to it."
        />
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => (
            <DraftRow key={p.proposalId} proposal={p} noCommitReason={NO_COMMIT_REASON[p.entity] ?? null} />
          ))}
          {unfinished.map((d) => (
            <UnfinishedDraftRow key={d.scope} draft={d} />
          ))}
        </ul>
      )}
    </IndexTemplate>
  )
}
