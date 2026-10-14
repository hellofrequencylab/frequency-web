import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { MembershipCancelButton } from '@/components/spaces/membership-cancel-button'
import { MembershipPromoteButton } from '@/components/spaces/membership-promote-button'
import { countActiveMembersByTier, listSpaceMemberships, type MembershipTier } from '@/lib/spaces/memberships'
import { isPastDueSpaceMembership, spacePastDueOwnerLabel } from '@/lib/spaces/membership-dunning'
import { HOME_TZ } from '@/lib/time/zone'
import { AdminHead, AdminPageBody, Av, EMPTY, n, usd } from '../shared'
import { loadSpaceMembershipBilling } from '../space-reads'

// THE SPACE MEMBERSHIPS, FREQUENCY (design_handoff/frequency/templates/admin/Memberships.html). Rendered by
// the Memberships section (app/(main)/spaces/[slug]/settings/memberships/section.tsx) under
// SITE_DESIGN=frequency, on the Offerings page and the in-place Memberships panel; DAWN keeps the section's
// own layout. The plan cards are the Space's real tiers (the section's listAllMembershipTiers read, handed
// in) with their active-member counts (countActiveMembersByTier); the members table is listSpaceMemberships,
// the read MembershipOwnerList makes, with the same promote and cancel actions. Every editor the section
// already renders (tiers, benefits, circle access, event access) follows as `children`, so no action is lost.
// The host page owns the h1, so this head is an h2.
//
// THE MONTHLY TOTAL in the meta line is loadSpaceMembershipBilling (space-reads.ts): only memberships with a
// Stripe subscription whose payment reconciled to active, at their tier's list price per month. Free joins
// never count, so while member billing is off the line reads $0, which is the truth.
//
// RENEWALS. The design's Renewals table ("next 14 days", the card on file) needs a renewal date and a card,
// and neither is stored: space_memberships keeps the subscription id and a payment status, and the period end
// lives in Stripe. So the table lists every member, its Renews column shows the design's empty value ("—")
// and the section head says why. A failed payment shows as the row's status (the member already sees a
// notice to update their card, lib/spaces/membership-dunning.ts), so there is no "Ask to update" button to
// draw. A failed billing read also shows the empty value.

const INTERVAL: Record<MembershipTier['interval'], string> = { month: 'a month', year: 'a year', once: 'once' }

function priceLine(t: MembershipTier): string {
  if (t.priceCents <= 0) return 'Free'
  return usd(t.priceCents)
}

// The home zone, so the server and the browser print the same day.
const joinedFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: HOME_TZ })

export async function FqMembershipsBody({
  spaceId,
  tiers,
  children,
}: {
  spaceId: string
  tiers: MembershipTier[]
  children: ReactNode
}) {
  const [members, byTier, billing] = await Promise.all([
    listSpaceMemberships(spaceId),
    countActiveMembersByTier(spaceId),
    loadSpaceMembershipBilling(spaceId),
  ])
  const active = members.filter((m) => m.status === 'active').length
  const top = tiers.reduce<{ id: string | null; count: number }>(
    (best, t) => {
      const c = t.id ? (byTier.get(t.id) ?? 0) : 0
      return c > best.count ? { id: t.id ?? null, count: c } : best
    },
    { id: null, count: 0 },
  )

  return (
    <AdminPageBody>
      <AdminHead
        level="h2"
        kicker="Plans and passes"
        title="Memberships"
        meta={`${n(active)} ${active === 1 ? 'member' : 'members'} · ${billing ? usd(billing.monthlyCents) : EMPTY} a month`}
        actions={
          <a className="btn pa" href="#membership-editor">
            <FqIcon name="plus" />
            New plan
          </a>
        }
      />

      {tiers.length === 0 && (
        <div className="panel stack adp-mid">
          <span className="h3">No plans yet</span>
          <span className="t2">Make a plan and people can join your Space from its page. A plan can be free.</span>
          <a className="btn sm pa self-start" href="#membership-editor">
            <FqIcon name="plus" />
            Make a plan
          </a>
        </div>
      )}

      {tiers.length > 0 && (
        <div className="g3">
          {tiers.map((t, i) => {
            const count = t.id ? (byTier.get(t.id) ?? 0) : 0
            const picked = !!t.id && t.id === top.id && tiers.length > 1
            return (
              <div key={t.id ?? `tier-${i}`} className={picked ? 'panel stack adp-mid adp-pick' : 'panel stack adp-mid'}>
                {picked || !t.isActive ? (
                  <span className="row">
                    <span className="h3 grow">{t.name}</span>
                    <span className="tag">{picked ? 'Most picked' : 'Hidden'}</span>
                  </span>
                ) : (
                  <span className="h3">{t.name}</span>
                )}
                <span className="num adp-num">{priceLine(t)}</span>
                <span className="t2">
                  {t.description?.trim() || (t.priceCents > 0 ? `Billed ${INTERVAL[t.interval]}.` : 'No charge to join.')}
                </span>
                <span className="t1">
                  {n(count)} {count === 1 ? 'member' : 'members'}
                </span>
                <a className="btn sm" href="#membership-editor" aria-label={`Edit plan: ${t.name}`}>
                  <FqIcon name="edit" />
                  Edit plan
                </a>
              </div>
            )
          })}
        </div>
      )}

      <div className="sec">
        <div className="sec-h">
          <span className="h2">Members</span>
          <span className="meta">
            {n(members.length)} {members.length === 1 ? 'person' : 'people'} · renewal dates live in Stripe for now
          </span>
        </div>
        <div className="panel tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Joined</th>
                <th>Renews</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td className="t1" colSpan={6}>
                    No members yet. When someone joins one of your plans, they show here.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="row">
                        <Av />
                        <span className="t1">{m.memberName}</span>
                      </span>
                    </td>
                    <td>{m.tierName}</td>
                    <td>{joinedFmt.format(new Date(m.startedAt))}</td>
                    <td>{EMPTY}</td>
                    <td>
                      {isPastDueSpaceMembership(m.paymentStatus) ? (
                        <span className="st bad">{spacePastDueOwnerLabel()}</span>
                      ) : m.status === 'waitlist' ? (
                        <span className="st n">Waitlist</span>
                      ) : (
                        <span className="st ok">Active</span>
                      )}
                    </td>
                    <td>
                      <span className="row wrap">
                        {m.status === 'waitlist' && <MembershipPromoteButton membershipId={m.id} />}
                        <MembershipCancelButton membershipId={m.id} />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="membership-editor" className="adp-legacy">
        {children}
      </div>
    </AdminPageBody>
  )
}
