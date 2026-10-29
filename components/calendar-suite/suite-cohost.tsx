'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cohostRows, hostsPlan, inviteChoices, sharedRollup, type SharedRollupRow } from '@/lib/calendar/planner/cohost'
import { hostSpaceId, isInvitePending } from '@/lib/calendar/planner/day-items'
import type { PlannerData, PlannerPlan } from '@/lib/calendar/planner/types'
import { useCohost } from './use-suite-cohost'
import type { SuiteContext } from './suite-types'

// THE CO-HOSTING PARTS (P7), each wired into the calendar by one line: the host, co-host and invited
// block in a Plan's Details, the Accept and Not this time presses in Needs you, and the Shared with
// Spaces roll-up under the Show tiles. Copy is the handoff's own (prototype-spec section 5): "{Space}
// wants to co-host", Co-host it, Not this time, Spaces, Host, Co-host, Invited, Invite a Space to co-host.

/** The Spaces on a Plan, who hosts, who is working it and who has only been asked. The Space that has
 *  an invite waiting answers it here; the Space that hosts can invite another or take an invite back. */
export function CohostBlock({ plan, ctx }: { plan: PlannerPlan; ctx: SuiteContext }) {
  const cohost = useCohost()
  const [pick, setPick] = useState('')
  const pending = isInvitePending(plan, ctx.ownSpaceId)
  const rows = cohostRows(plan, ctx.ownSpaceId, ctx.ownName, ctx.spaceNames)
  const host = hostSpaceId(plan)
  const hostName = host ? (ctx.spaceNames[host] ?? 'Another Space') : 'Another Space'
  const hosting = hostsPlan(plan, ctx.ownSpaceId)
  const choices = cohost && hosting ? inviteChoices(cohost.collaborators, plan) : []
  const canAsk = !!cohost?.canEdit && hosting
  if (!pending && rows.length < 2 && !canAsk) return null
  return (
    <div className="cal-cohost">
      {pending ? (
        <div className="cal-invite" role="group" aria-label="Invitation to co-host">
          <p>
            <strong>{hostName}</strong> wants to co-host
          </p>
          <p className="cal-muted">Say yes and it lands on your calendar, and both teams can edit it.</p>
          {cohost?.canEdit ? (
            <div className="cal-invite-act">
              <Button type="button" size="sm" disabled={cohost.busy} onClick={() => cohost.answer(plan.id, 'accepted')}>
                Co-host it
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={cohost.busy} onClick={() => cohost.answer(plan.id, 'declined')}>
                Not this time
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {rows.length > 1 ? (
        <section aria-label="Spaces">
          <p className="cal-caps">Spaces</p>
          <ul className="cal-plain">
            {rows.map((row) => (
              <li key={row.id} className="cal-srow">
                <span>{row.name}</span>
                <span className="cal-srow-r">
                  <span className="cal-muted">{row.label}</span>
                  {canAsk && row.label !== 'Host' && row.shareId ? (
                    <button
                      type="button"
                      className="cal-link cal-takeback"
                      disabled={cohost?.busy}
                      onClick={() => cohost?.takeBack(plan.id, { id: row.id, name: row.name }, row.shareId as string)}
                    >
                      Take back
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {canAsk && cohost ? (
        choices.length > 0 ? (
          <div className="cal-invite-new">
            <label className="cal-caps" htmlFor={`cal-invite-${plan.id}`}>
              Invite a Space to co-host
            </label>
            <div className="cal-invite-row">
              <Select
                id={`cal-invite-${plan.id}`}
                value={pick}
                emptyLabel="Pick a Space"
                options={choices.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(e) => setPick(e.target.value)}
              />
              <Button
                type="button"
                variant="primarySoft"
                disabled={!pick || cohost.busy}
                onClick={() => {
                  const chosen = choices.find((c) => c.id === pick)
                  if (!chosen) return
                  cohost.invite(plan.id, chosen)
                  setPick('')
                }}
              >
                Invite
              </Button>
            </div>
          </div>
        ) : (
          <p className="cal-serif">
            {cohost.collaborators.length === 0 ? (
              <>
                Collaborate with another Space first, then invite it here. <a className="cal-link" href={cohost.collaboratorsHref}>Find collaborators</a>
              </>
            ) : (
              'Every Space you collaborate with is already on this Plan.'
            )}
          </p>
        )
      ) : null}
    </div>
  )
}

/** The press on an invite chip in Needs you (the handoff's one action there is Accept). Saying no is in
 *  Details, beside the sentence that says what a yes does. */
export function InviteAnswerButtons({ planId }: { planId: string }) {
  const cohost = useCohost()
  if (!cohost?.canEdit) return null
  return (
    <button type="button" className="cal-need-act" disabled={cohost.busy} onClick={() => cohost.answer(planId, 'accepted')}>
      Accept
    </button>
  )
}

const TIER_WORD: Record<SharedRollupRow['tier'], string> = {
  partner: 'Co-hosting',
  collaborator: 'Collaborators',
  network: 'Network',
}

/** What the Shared with Spaces tile holds this month, by where it came from. The Network row takes the
 *  roll-up's own name (Chapters, Member Spaces) when this Space is the parent of one. */
export function SharedRollup({
  data,
  ctx,
  ym,
  hidden,
}: {
  data: PlannerData
  ctx: SuiteContext
  ym: string
  hidden: boolean
}) {
  const networkNoun = useCohost()?.networkNoun ?? null
  const rows = sharedRollup(data.items, data.plans, ctx.spaceNames, ctx.ownSpaceId, ym)
  if (rows.length === 0) return null
  return (
    <ul className="cal-plain cal-rollup" aria-label="Shared with Spaces this month" data-off={hidden || undefined}>
      {rows.map((row) => (
        <li key={row.tier} className="cal-rollup-row">
          <span className="cal-rollup-t">
            <span>{row.tier === 'network' && networkNoun ? networkNoun : TIER_WORD[row.tier]}</span>
            <span className="cal-as">{rollupNames(row.spaces)}</span>
          </span>
          <span className="cal-count">{row.count}</span>
        </li>
      ))}
    </ul>
  )
}

/** "Swami's Beach", "Swami's Beach and Vine", "Swami's Beach, Vine and 3 more". */
function rollupNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}
