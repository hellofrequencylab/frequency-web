import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/field'
import type { OrganiserRefusal, PartnerListItem, StewardInviteView } from '@/lib/hunts/partner-store'
import { stewardRefusalMessage, type StewardRefusal } from '@/lib/hunts/partners'
import { invitePartnerAction, revokePartnerAction, stewardAnswerAction } from '@/app/(main)/hunts/partners/actions'

// The bodies of the two partner screens (FH-029); each page composes the Focus shell around one.
// Server-rendered; every change is a form to a server action.

const STATUS: Record<PartnerListItem['status'], string> = {
  invited: 'Invited, no answer yet',
  accepted: 'Partner',
  declined: 'Declined',
  expired: 'Invite ended',
  withdrawn: 'Withdrew',
  suspended: 'Ended by the organiser',
}

const ORGANISER_SAID: Record<OrganiserRefusal | 'invited' | 'ended', string> = {
  invited: 'Invite sent.',
  ended: 'Partnership ended. New visits at that venue will not count.',
  forbidden: 'Only the Hunt owner or an admin can manage partners.',
  not_a_steward: 'Name a current steward of that Space. Check the Space address and the handle.',
  own_space: 'This Space already runs the Hunt. It needs no invite.',
  already_partner: 'That Space is already a partner on this Hunt.',
  nothing_to_end: 'There is nothing to end for that Space.',
  changed: 'That changed while you were looking. Check the list and try again.',
  failed: 'The invite could not be saved. Try again.',
}

/** The organiser's list: who was invited, who answered, and the invite form. */
export function HuntPartnerList({ huntId, view, said }: { huntId: string; view: { partners: readonly PartnerListItem[]; termsApproved: boolean }; said: string | null }) {
  const line = said && Object.hasOwn(ORGANISER_SAID, said) ? ORGANISER_SAID[said as keyof typeof ORGANISER_SAID] : null
  return (
    <>
      <div className="space-y-10">
        {line && <p role="status" className="text-body-sm text-text">{line}</p>}
        {!view.termsApproved && (
          <p className="text-body-sm text-muted">The partner terms are still a draft. You can send invites now, and venues can accept once the terms are final.</p>
        )}
        <section aria-labelledby="partner-list-heading">
          <h2 id="partner-list-heading" className="text-body font-medium">Venues</h2>
          {view.partners.length === 0 ? (
            <div className="mt-3">
              <EmptyState variant="first-use" title="No partner venues yet" description="A stop at another Space needs that Space as a partner before you can publish." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border text-body-sm">
              {view.partners.map((p) => (
                <li key={p.spaceId} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-text">{p.spaceName}</p>
                    <p className="text-muted">
                      {p.live ? 'Partner' : STATUS[p.status]}
                      {p.stewardName ? `. Steward: ${p.stewardName}` : ''}
                      {p.status === 'invited' && !p.termsCurrent ? '. The terms changed, so send a new invite.' : ''}
                    </p>
                    {p.status === 'invited' && (
                      <p className="text-muted">Their link: <span className="break-all text-text">/hunts/partners/{huntId}/{p.spaceId}</span></p>
                    )}
                  </div>
                  {(p.status === 'invited' || p.live) && (
                    <form action={revokePartnerAction}>
                      <input type="hidden" name="huntId" value={huntId} />
                      <input type="hidden" name="spaceId" value={p.spaceId} />
                      <Button type="submit" variant="ghost" size="sm">{p.live ? 'End partnership' : 'Cancel invite'}</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="partner-invite-heading">
          <h2 id="partner-invite-heading" className="text-body font-medium">Invite a venue</h2>
          <p className="mt-1 text-body-sm text-muted">Name the Space and the steward who will answer for it. If the link is passed to anyone else, it does nothing.</p>
          <form action={invitePartnerAction} className="mt-4 space-y-4">
            <input type="hidden" name="huntId" value={huntId} />
            <Field label="Space address" hint="The last part of the Space link, like north-park-shop.">
              <Input name="spaceSlug" required maxLength={120} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Steward handle" hint="The owner or an admin of that Space.">
              <Input name="stewardHandle" required maxLength={60} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Button type="submit">Send invite</Button>
          </form>
        </section>
      </div>
    </>
  )
}

const SAID: Record<string, string> = {
  accepted: 'You are in. Your venue is now a partner on this Hunt.',
  declined: 'Invite declined.',
  withdrawn: 'Your venue has withdrawn. New visits here will not count. Credit players already earned stays with them.',
  changed: 'That changed while you were looking. Check the page and try again.',
}
const REFUSALS: readonly StewardRefusal[] = ['no_invite', 'not_invitee', 'not_steward_now', 'terms_not_approved', 'terms_changed', 'not_a_partner']

function saidLine(said: string | null): string | null {
  if (!said) return null
  if (Object.hasOwn(SAID, said)) return SAID[said]
  const refusal = REFUSALS.find((r) => r === said)
  return refusal ? stewardRefusalMessage(refusal) : null
}

function Answer({ view, answer, label, variant }: { view: StewardInviteView; answer: 'accept' | 'decline' | 'withdraw'; label: string; variant?: 'primary' | 'ghost' }) {
  return (
    <form action={stewardAnswerAction}>
      <input type="hidden" name="huntId" value={view.huntId} />
      <input type="hidden" name="spaceId" value={view.spaceId} />
      <input type="hidden" name="answer" value={answer} />
      <Button type="submit" variant={variant ?? 'primary'}>{label}</Button>
    </form>
  )
}

/** The venue steward's screen: answer an invite, or withdraw a partnership. */
export function HuntStewardInvite({ view, said }: { view: StewardInviteView; said: string | null }) {
  const line = saidLine(said)
  const canAccept = view.isInvitee && view.termsApproved && view.termsCurrent
  return (
    <>
      <div className="space-y-6">
        {line && <p role="status" className="text-body-sm text-text">{line}</p>}
        {view.isInvitee ? (
          <section aria-labelledby="invite-heading" className="space-y-4">
            <h2 id="invite-heading" className="text-body font-medium">You are invited to host a stop</h2>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-muted">
              <li>This invite is for you, as a steward of {view.spaceName}. Nobody else can answer it.</li>
              <li>Accepting lets your staff confirm visits and redeem rewards at your venue.</li>
              <li>You can withdraw at any time. New visits stop counting, and credit players already earned stays.</li>
            </ul>
            {view.termsVersion && <p className="text-body-sm text-muted">Terms version {view.termsVersion.slice(0, 12)}</p>}
            {!view.termsApproved ? (
              <p className="text-body-sm text-text">The partner terms are not final yet, so this invite cannot be accepted today.</p>
            ) : !view.termsCurrent ? (
              <p className="text-body-sm text-text">The partner terms changed after this invite was sent. Ask the organiser for a new invite.</p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {canAccept && <Answer view={view} answer="accept" label="Accept the terms" />}
              <Answer view={view} answer="decline" label="Decline" variant="ghost" />
            </div>
          </section>
        ) : view.live ? (
          <section aria-labelledby="partner-heading" className="space-y-4">
            <h2 id="partner-heading" className="text-body font-medium">{view.spaceName} is a partner</h2>
            <p className="text-body-sm text-muted">Withdrawing stops new visits at your venue from counting, right away. Credit players already earned stays with them.</p>
            <Answer view={view} answer="withdraw" label="Withdraw" variant="ghost" />
          </section>
        ) : (
          <EmptyState variant="cleared" title="Nothing to answer" description={`${view.spaceName} is not an active partner on this Hunt.`} />
        )}
      </div>
    </>
  )
}
