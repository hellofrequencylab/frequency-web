import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { listMyCreateProposals } from '@/lib/ai/vera/create-entity'
import { NO_COMMIT_REASON } from '@/lib/ai/vera/create-commits'
import { DraftRow } from './draft-row'

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
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Drafts' }

export default async function DraftsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const proposals = await listMyCreateProposals()

  return (
    <IndexTemplate
      title="Drafts"
      description="Things drawn up for you to look at. Nothing here is made yet, and nothing gets made until you say so."
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/drafts', label: 'Drafts' },
      ]}
    >
      {proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No drafts waiting"
          description="When Vera drafts something for you, or you start something and step away, it waits here for a day."
        />
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => (
            <DraftRow key={p.proposalId} proposal={p} noCommitReason={NO_COMMIT_REASON[p.entity] ?? null} />
          ))}
        </ul>
      )}
    </IndexTemplate>
  )
}
