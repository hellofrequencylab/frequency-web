'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { respondToPlanShare, revokePlanShare, sharePlanWithSpace } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-actions'
import { Toast } from '@/components/ui/toast'
import type { AdaptedCalendar } from '@/lib/calendar/planner/adapters'
import { addInvited, answerInvite, dropInvited, type InviteAnswer } from '@/lib/calendar/planner/cohost'

// CO-HOSTING ON THE CALENDAR (P7). The three doors the handshake already has (answer, invite, take
// back) as presses a person makes in Details and in Needs you. Each press is shown at once and written
// through the existing server action; if the server says no the calendar goes back and a toast says
// why. The records stay the page's: this lays the presses OVER them until the page comes back with the
// truth, then drops them (the same shape as use-suite-moves.tsx).

type Result = { error: string } | { data?: unknown }

/** The writes a press makes. Absent means the calendar's own server actions; a test passes stand-ins. */
export interface CohostActions {
  respond: (shareId: string, answer: InviteAnswer) => Promise<Result>
  invite: (planId: string, spaceId: string) => Promise<{ error: string } | { data: { id: string } }>
  revoke: (shareId: string) => Promise<Result>
}

export function cohostActionsFor(slug: string): CohostActions {
  return {
    respond: (shareId, answer) => respondToPlanShare(slug, shareId, answer),
    invite: (planId, spaceId) => sharePlanWithSpace(slug, planId, spaceId),
    revoke: (shareId) => revokePlanShare(slug, shareId),
  }
}

type Op =
  | { type: 'answer'; planId: string; answer: InviteAnswer }
  | { type: 'invite'; planId: string; space: { id: string; name: string }; shareId: string }
  | { type: 'drop'; planId: string; spaceId: string }

function apply(data: AdaptedCalendar, op: Op, ownSpaceId: string): AdaptedCalendar {
  if (op.type === 'answer') return answerInvite(data, op.planId, ownSpaceId, op.answer)
  if (op.type === 'invite') return addInvited(data, op.planId, op.space, op.shareId)
  return dropInvited(data, op.planId, op.spaceId)
}

interface CohostApi {
  /** False for someone who can read the calendar but not change it: no presses. */
  canEdit: boolean
  /** The Spaces this one may invite, by name. */
  collaborators: readonly { id: string; name: string }[]
  /** What this Space calls its roll-up when it is the parent of a Network or a Collective. */
  networkNoun: string | null
  /** Where a Space makes a collaboration to invite from. */
  collaboratorsHref: string
  /** True while a press is on its way to the server. */
  busy: boolean
  answer: (planId: string, answer: InviteAnswer) => void
  invite: (planId: string, space: { id: string; name: string }) => void
  takeBack: (planId: string, space: { id: string; name: string }, shareId: string) => void
}

const CohostContext = createContext<CohostApi | null>(null)

export function CohostProvider({ api, children }: { api: CohostApi; children: ReactNode }) {
  return <CohostContext.Provider value={api}>{children}</CohostContext.Provider>
}

/** The presses, or null where the calendar has no co-hosting (a bare render in a test). */
export function useCohost(): CohostApi | null {
  return useContext(CohostContext)
}

interface ToastState {
  id: number
  line: string
  tone: 'success' | 'danger'
}

const TOAST_MS = 7000

interface SuiteCohost {
  /** The calendar with the presses laid over it. */
  data: AdaptedCalendar
  api: CohostApi
  /** The toast, to render once inside the calendar. */
  layer: ReactNode
}

export function useSuiteCohost({
  truth,
  base,
  ownSpaceId,
  actions,
  canEdit,
  collaborators,
  collaboratorsHref,
  networkNoun,
}: {
  /** What the page loaded. When it changes the presses have done their job. */
  truth: AdaptedCalendar
  /** The calendar the presses go over: the page's records with any moved dates laid on. */
  base: AdaptedCalendar
  ownSpaceId: string
  actions: CohostActions
  canEdit: boolean
  collaborators: readonly { id: string; name: string }[]
  collaboratorsHref: string
  networkNoun: string | null
}): SuiteCohost {
  const [ops, setOps] = useState<readonly Op[]>([])
  const [seen, setSeen] = useState(truth)
  if (seen !== truth) {
    setSeen(truth)
    setOps([])
  }
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const counter = useRef(0)
  const actionsRef = useRef(actions)
  const latest = useRef(base)
  useEffect(() => {
    actionsRef.current = actions
    latest.current = base
  })

  const data = useMemo(() => (ops.length === 0 ? base : ops.reduce((d, op) => apply(d, op, ownSpaceId), base)), [base, ops, ownSpaceId])

  const say = useCallback((line: string, tone: ToastState['tone']) => {
    counter.current += 1
    setToast({ id: counter.current, line, tone })
  }, [])
  const show = useCallback((op: Op) => setOps((o) => [...o, op]), [])
  const hide = useCallback((op: Op) => setOps((o) => o.filter((x) => x !== op)), [])

  const run = useCallback(
    async (op: Op, write: () => Promise<Result>, done: string, refused: string) => {
      show(op)
      setBusy(true)
      const res = await write().catch(() => ({ error: 'That did not go through.' }))
      setBusy(false)
      if ('error' in res) {
        hide(op)
        say(`${refused} ${res.error}`, 'danger')
      } else {
        say(done, 'success')
      }
    },
    [hide, say, show],
  )

  const api = useMemo<CohostApi>(
    () => ({
      canEdit,
      collaborators,
      collaboratorsHref,
      networkNoun,
      busy,
      answer: (planId, answer) => {
        if (!canEdit) return
        const shareId = latest.current.plans.find((p) => p.id === planId)?.spaces.find((s) => s.id === ownSpaceId)?.shareId
        if (!shareId) {
          say('That invite is not on this calendar any more.', 'danger')
          return
        }
        void run(
          { type: 'answer', planId, answer },
          () => actionsRef.current.respond(shareId, answer),
          answer === 'accepted' ? 'You are co-hosting. It is on your calendar now.' : 'Declined. We let them know.',
          'Nothing changed.',
        )
      },
      invite: (planId, space) => {
        if (!canEdit) return
        // The share's id comes back from the server, so the row waits for it before it shows.
        setBusy(true)
        void (async () => {
          const res = await actionsRef.current.invite(planId, space.id).catch(() => ({ error: 'That did not go through.' }))
          setBusy(false)
          if ('error' in res) say(`No invite went out. ${res.error}`, 'danger')
          else {
            show({ type: 'invite', planId, space, shareId: res.data.id })
            say(`Invite sent to ${space.name}.`, 'success')
          }
        })()
      },
      takeBack: (planId, space, shareId) => {
        if (!canEdit) return
        void run(
          { type: 'drop', planId, spaceId: space.id },
          () => actionsRef.current.revoke(shareId),
          `Took the invite back from ${space.name}.`,
          'The invite is still out.',
        )
      },
    }),
    [busy, canEdit, collaborators, collaboratorsHref, networkNoun, ownSpaceId, run, say, show],
  )

  const layer = toast ? (
    <div className="cal-toast" key={toast.id}>
      <Toast
        tone={toast.tone}
        icon={toast.tone === 'danger' ? <TriangleAlert className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        title={toast.line}
        duration={TOAST_MS}
        onDismiss={() => setToast(null)}
      />
    </div>
  ) : null

  return { data, api, layer }
}
