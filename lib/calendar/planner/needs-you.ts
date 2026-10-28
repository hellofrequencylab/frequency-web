import { findClashes } from './clash'
import { hostSpaceId, isInvitePending } from './day-items'
import { dayLabel, monthDayLabel } from './days'
import { isHoldLapsed } from './hold'
import type { PlannerData } from './types'

// NEEDS YOU: the short list of things waiting on a person, in the order they matter. The count in
// the header is the length of this list, so each overdue to-do and each clash is its own entry.

type NeedsYouOp = 'accept' | 'today' | 'open' | 'plan' | 'publish' | 'inbox'
type NeedsYouKind = 'invite' | 'overdue' | 'clash' | 'hold' | 'lapsed' | 'publish' | 'undated'

interface NeedsYouEntry {
  id: string
  kind: NeedsYouKind
  /** Token for the entry's accent. */
  tone: string
  /** Sprite icon id. */
  icon: string
  text: string
  sub: string
  /** The button word. */
  action: string
  op: NeedsYouOp
  /** The record the action works on: a Plan, to-do or item id. Empty for the undated group. */
  ref: string
}

/** Everything waiting on a person: invites to answer, overdue to-dos, clashes with unavailable time,
 *  open and lapsed holds, productions not yet published, and the to-dos with no date. */
export function needsYou(
  data: PlannerData,
  today: string,
  ownSpaceId: string,
  spaceNames: Readonly<Record<string, string>> = {},
): NeedsYouEntry[] {
  const out: NeedsYouEntry[] = []

  for (const plan of data.plans) {
    if (!isInvitePending(plan, ownSpaceId)) continue
    const host = hostSpaceId(plan)
    out.push({
      id: `inv-${plan.id}`,
      kind: 'invite',
      tone: 'var(--live)',
      icon: 'invite',
      text: `${(host && spaceNames[host]) || 'Another Space'} invited you to co-host`,
      sub: plan.title,
      action: 'Accept',
      op: 'accept',
      ref: plan.id,
    })
  }

  for (const t of data.tasks) {
    if (t.done || !t.due || t.due >= today) continue
    out.push({
      id: `late-${t.id}`,
      kind: 'overdue',
      tone: 'var(--live)',
      icon: 'clock',
      text: t.title,
      sub: `Overdue since ${dayLabel(t.due)}`,
      action: 'Do today',
      op: 'today',
      ref: t.id,
    })
  }

  const clashes = findClashes(data.items)
  for (const it of data.items) {
    if (!clashes.has(it.id)) continue
    out.push({
      id: `clash-${it.id}`,
      kind: 'clash',
      tone: 'var(--reward)',
      icon: 'flag',
      text: `${it.title} overlaps unavailable time`,
      sub: dayLabel(it.date),
      action: 'Move',
      op: 'open',
      ref: it.id,
    })
  }

  for (const plan of data.plans) {
    if (plan.stage !== 'pencil' || !plan.hold || isInvitePending(plan, ownSpaceId)) continue
    const n = data.items.filter((i) => i.plan === plan.id && i.option).length
    if (isHoldLapsed(plan.hold, today)) {
      out.push({
        id: `hold-${plan.id}`,
        kind: 'lapsed',
        tone: 'var(--live)',
        icon: 'edit',
        text: `The hold on ${plan.title} has lapsed`,
        sub: `Hold ended ${monthDayLabel(plan.hold)}`,
        action: n > 1 ? 'Pick one' : 'Confirm',
        op: 'plan',
        ref: plan.id,
      })
      continue
    }
    out.push({
      id: `hold-${plan.id}`,
      kind: 'hold',
      tone: 'var(--text-muted)',
      icon: 'edit',
      text: n > 1 ? `${plan.title} has ${n} dates pencilled` : `${plan.title} is pencilled`,
      sub: `Hold ends ${monthDayLabel(plan.hold)}`,
      action: n > 1 ? 'Pick one' : 'Confirm',
      op: 'plan',
      ref: plan.id,
    })
  }

  for (const plan of data.plans) {
    if (plan.stage !== 'production') continue
    out.push({
      id: `pub-${plan.id}`,
      kind: 'publish',
      tone: 'var(--presence)',
      icon: 'event',
      text: `${plan.title} is ready to go live`,
      sub: 'Production · not public yet',
      action: 'Publish',
      op: 'publish',
      ref: plan.id,
    })
  }

  const undated = data.tasks.filter((t) => !t.done && !t.due).length
  if (undated) {
    out.push({
      id: 'undated',
      kind: 'undated',
      tone: 'var(--text-muted)',
      icon: 'tip',
      text: undated === 1 ? '1 to-do has no date' : `${undated} to-dos have no date`,
      sub: 'Drag them onto a day',
      action: 'Show',
      op: 'inbox',
      ref: '',
    })
  }

  return out
}
