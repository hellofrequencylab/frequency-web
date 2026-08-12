import { Users } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonCard } from '@/components/cards/person-card'
import { getMyProfileId } from '@/lib/auth'
import { bundleSellable } from '@/lib/pricing/settings'
import { loadBundleSeatBoard, listBundleSeatInvitesForMember } from '@/lib/billing/bundle-invites'
import { ENTITLEMENT_LABEL } from '@/lib/core/entitlement'
import { InviteToSeatForm, RevokeSeatOfferButton, AnswerSeatOfferButtons } from './bundle-seat-controls'

// HOUSEHOLD BUNDLE SEATS — the member-facing half of ADR-370's post-purchase seat management,
// rendered inside the Plan and billing section of /settings (the page already composes
// FocusTemplate, so this adds no route and no shell of its own). Two audiences, one surface:
//
//   · the OWNER manages their bundle: who is seated, who has been offered a seat, how many are
//     left, and the one field that offers another.
//   · an INVITEE answers. They land here from the notification the offer writes, which is the
//     same place they would look for anything about their plan.
//
// Composed, not authored (PAGE-FRAMEWORK §3): SectionHeader for the group labels, PersonCard for
// every person, EmptyState for the nothing-yet moment, and the kit's Button/Field in the client
// leaves. This file declares no card, grid or header of its own.
//
// GATED: renders NOTHING unless bundleSellable() (billingLive() AND bundle_household_enabled,
// FAIL-SAFE FALSE), so the whole surface is dark on an unflipped platform.

export async function BundleSeatsSection() {
  if (!(await bundleSellable())) return null
  const me = await getMyProfileId()
  if (!me) return null

  const [board, waiting] = await Promise.all([
    loadBundleSeatBoard(me),
    listBundleSeatInvitesForMember(me),
  ])
  // Nothing to own and nothing to answer: no empty module on a member's settings page.
  if (!board.ownsBundle && waiting.length === 0) return null

  const tierName = ENTITLEMENT_LABEL[board.tier]
  const filled = board.seated.length
  const offered = board.pending.length

  return (
    <div className="mt-6 space-y-8">
      {waiting.length > 0 && (
        <section aria-labelledby="bundle-seat-offers">
          <SectionHeader id="bundle-seat-offers" title="A seat is waiting for you" count={waiting.length} />
          <p className="-mt-1 mb-3 max-w-xl text-body-sm text-muted">
            Taking a seat gives you {tierName} while the bundle is paid for. Your current plan is
            put back if the bundle ends.
          </p>
          <div className="space-y-3">
            {waiting.map((invite) => (
              <PersonCard
                key={invite.id}
                handle={invite.personHandle}
                displayName={invite.personName}
                avatarUrl={invite.personAvatarUrl}
                context="Offered you a seat on their Household bundle"
                action={<AnswerSeatOfferButtons inviteId={invite.id} />}
              />
            ))}
          </div>
        </section>
      )}

      {board.ownsBundle && (
        <section aria-labelledby="bundle-seats">
          <SectionHeader id="bundle-seats" title="Household bundle" count={board.seats} />
          <p className="-mt-1 mb-3 max-w-xl text-body-sm text-muted">
            {filled} of {board.seats} seats filled
            {offered > 0 ? `, ${offered} waiting on an answer` : ''}. Everyone seated gets{' '}
            {tierName} for as long as the bundle is paid for.
          </p>

          {filled === 1 && offered === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody else is seated yet"
              description="Invite someone by handle. They pick up their seat when they accept, and nothing changes for them until they do."
            />
          ) : (
            <div className="space-y-3">
              {board.seated.map((person) => (
                <PersonCard
                  key={person.profileId}
                  handle={person.handle}
                  displayName={person.displayName}
                  avatarUrl={person.avatarUrl}
                  context={person.isOwner ? 'You pay for this bundle' : `Seated, on ${tierName}`}
                />
              ))}
              {board.pending.map((invite) => (
                <PersonCard
                  key={invite.id}
                  handle={invite.personHandle}
                  displayName={invite.personName}
                  avatarUrl={invite.personAvatarUrl}
                  context="Invited, waiting for an answer"
                  action={<RevokeSeatOfferButton inviteId={invite.id} />}
                />
              ))}
            </div>
          )}

          <InviteToSeatForm seatsOpen={board.seatsOpen} />
          {board.seatsOpen <= 0 && (
            <p className="mt-3 text-body-sm text-muted">
              Every seat is taken or offered. Withdraw an invite to free one up.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
