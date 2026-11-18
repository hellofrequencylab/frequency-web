'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock3, Gem, Zap } from 'lucide-react'
import { Toast } from '@/components/ui/toast'

// Lightweight "you earned zaps" toast. Mirrors the achievement-toast pattern: a
// global container listens for a window CustomEvent; showZapToast() dispatches it.
// Used for realtime reward feedback on verified practice / captures (Phase 3).
//
// The CARD is components/ui/toast.tsx now — this file keeps only what is actually
// zap-specific: the event name, the reward shape, the copy, and the 4s dwell. The
// shell, the slide-up, the timer and the `role="status"` announcement are the kit's.

export interface ZapReward {
  amount: number
  label?: string
  /** Gems ride the same lane (LIVE-671, a reward pushed over the member's Realtime channel). Default 'zaps'. */
  kind?: 'zaps' | 'gems'
  /** Headline override ("Welcome back"). Default: the amount, "+15 Zaps". */
  title?: string
  /** Where the reward came from. 'remote' = the Realtime feed (components/reward-live.tsx), which
   *  cannot tell this tab from another one; a local toast for the same reward replaces it. */
  source?: 'local' | 'remote'
}

type RewardKind = 'zaps' | 'gems'

const EVENT = 'zaps-earned'
const NOTICE_EVENT = 'lane-notice'
const CLAIM_EVENT = 'reward-claimed'

/** A plain, sticky notice that is not a reward (the timer's "session expired" line). It rides the
 *  same lane and the same Toast card as the rewards, so a Mindless notice can never sit in a box
 *  of its own on top of a "+15 Zaps". */
export interface LaneNotice {
  title: string
  body: string
}

export function showLaneNotice(notice: LaneNotice) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: notice }))
}

function ZapToastCard({ reward, onDismiss }: { reward: ZapReward; onDismiss: () => void }) {
  const gems = reward.kind === 'gems'
  return (
    <Toast
      icon={gems ? <Gem className="h-5 w-5" strokeWidth={2.5} /> : <Zap className="h-5 w-5" strokeWidth={2.5} />}
      title={reward.title ?? `+${reward.amount} ${gems ? 'Gems' : 'Zaps'}`}
      tone={gems ? 'signal' : 'primary'}
      duration={4000}
      dismissible
      onDismiss={onDismiss}
    >
      {reward.label ?? (gems ? 'Reward earned' : 'Verified practice')}
    </Toast>
  )
}

/** The plain-English reason for a reward, from the ledger's action_type (the Realtime payload's
 *  `action`). Replaces "Earned on another device": the feed cannot tell this tab from another one,
 *  so that line was false every time the reward was earned right here. PURE. */
export function rewardLabel(action: string | null | undefined): string {
  const a = String(action ?? '')
  if (a === 'daily_login') return 'For checking in today'
  if (a === 'welcome_back') return 'Welcome back'
  if (a.startsWith('practice_')) return 'Practice logged'
  if (a === 'post_create') return 'For sharing a post'
  if (a === 'comment_reply') return 'For joining the conversation'
  if (a === 'reaction') return 'For cheering someone on'
  if (a === 'event_rsvp') return 'For saying you will be there'
  if (a === 'circle_join') return 'For joining a Circle'
  if (a === 'gift_received') return 'A gift from a friend'
  if (a.startsWith('create_')) return 'For making something'
  if (a === 'achievement') return 'Achievement'
  return 'Reward earned'
}

/** A reward the container is showing, with when it arrived (for the dedupe window). */
type Shown = { key: number; at: number; reward: ZapReward }

/** One reward, one toast. A reward reaches the lane up to twice: from the action that earned it
 *  (local, with the specific copy) and from the Realtime feed (remote, generic copy), in either
 *  order, because the broadcast fires inside the action and can beat its response home. Same kind
 *  and amount inside the echo window is the same reward: a local copy upgrades a remote one in
 *  place, anything else is dropped. PURE. */
export function mergeReward(prev: Shown[], next: ZapReward, now: number, key: number): Shown[] {
  const kind = next.kind ?? 'zaps'
  const i = prev.findIndex(
    (t) => (t.reward.kind ?? 'zaps') === kind && t.reward.amount === next.amount && now - t.at <= ECHO_WINDOW_MS,
  )
  if (i === -1) return [...prev, { key, at: now, reward: next }]
  if (prev[i].reward.source === 'remote' && next.source !== 'remote') {
    const copy = prev.slice()
    copy[i] = { ...prev[i], reward: next }
    return copy
  }
  return prev
}

export function ZapToastContainer() {
  const [toasts, setToasts] = useState<Shown[]>([])
  const [notices, setNotices] = useState<{ key: number; notice: LaneNotice }[]>([])

  useEffect(() => {
    function handle(e: Event) {
      const reward = (e as CustomEvent<ZapReward>).detail
      if (!reward || reward.amount <= 0) return
      const now = Date.now()
      setToasts((prev) => mergeReward(prev, reward, now, now + Math.random()))
    }
    function handleClaim(e: Event) {
      // A screen that shows the reward itself (the Mindless reveal) claimed it: drop a remote copy.
      const c = (e as CustomEvent<{ kind: RewardKind; amount: number }>).detail
      if (!c) return
      setToasts((prev) =>
        prev.filter((t) => !(t.reward.source === 'remote' && (t.reward.kind ?? 'zaps') === c.kind && t.reward.amount === c.amount)),
      )
    }
    function handleNotice(e: Event) {
      const notice = (e as CustomEvent<LaneNotice>).detail
      if (!notice?.title) return
      setNotices((prev) => [...prev, { key: Date.now() + Math.random(), notice }])
    }
    window.addEventListener(EVENT, handle)
    window.addEventListener(NOTICE_EVENT, handleNotice)
    window.addEventListener(CLAIM_EVENT, handleClaim)
    return () => {
      window.removeEventListener(EVENT, handle)
      window.removeEventListener(NOTICE_EVENT, handleNotice)
      window.removeEventListener(CLAIM_EVENT, handleClaim)
    }
  }, [])

  const dismiss = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key))
  }, [])

  return (
    // The lane itself is <ToastLane> in app/(main)/layout.tsx — ONE fixed column shared with the
    // achievement stack. This container used to declare its own `fixed bottom-32 right-4 z-50 …
    // md:bottom-24`, byte-identical to the achievement toast's, so two independent boxes claimed
    // the same rect and DOM order decided which one a member could read. Worse, both sat at z-50
    // alongside the Vera panel and BELOW it in DOM order, so a "+15 Zaps" toast fired while the
    // panel was open was awarded to a member who never saw it. See components/toast-lane.tsx.
    <div className="flex flex-col gap-3">
      {notices.map((n) => (
        <Toast
          key={n.key}
          title={n.notice.title}
          icon={<Clock3 className="h-5 w-5" />}
          tone="neutral"
          duration={0}
          dismissible
          onDismiss={() => setNotices((prev) => prev.filter((x) => x.key !== n.key))}
        >
          {n.notice.body}
        </Toast>
      ))}
      {toasts.map((t) => (
        <ZapToastCard key={t.key} reward={t.reward} onDismiss={() => dismiss(t.key)} />
      ))}
    </div>
  )
}

// The toasts this tab raised itself, briefly remembered so the cross-device feed
// (components/reward-live.tsx) does not repeat a reward the member is already looking at.
const recentLocal: { kind: RewardKind; amount: number; at: number }[] = []
const ECHO_WINDOW_MS = 15_000

function rememberLocal(kind: RewardKind, amount: number) {
  const now = Date.now()
  recentLocal.push({ kind, amount, at: now })
  while (recentLocal.length > 20 || (recentLocal[0] && now - recentLocal[0].at > ECHO_WINDOW_MS)) recentLocal.shift()
}

export function showZapToast(reward: ZapReward) {
  if (typeof window === 'undefined' || reward.amount <= 0) return
  rememberLocal(reward.kind ?? 'zaps', reward.amount)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...reward, source: 'local' } }))
}

/** A reward this tab is showing on a screen of its own (the Mindless reveal counts the Zaps up):
 *  no toast for it, now or when its broadcast lands. Removes a remote copy already in the lane. */
export function claimReward(kind: RewardKind, amount: number) {
  if (typeof window === 'undefined' || amount <= 0) return
  rememberLocal(kind, amount)
  window.dispatchEvent(new CustomEvent(CLAIM_EVENT, { detail: { kind, amount } }))
}

/** Did this tab just show this reward itself? Consumes the match, so a second real reward of the
 *  same size still shows. PURE apart from that one-shot memory. */
export function consumeLocalEcho(kind: 'zaps' | 'gems', amount: number, now = Date.now()): boolean {
  const i = recentLocal.findIndex((r) => r.kind === kind && r.amount === amount && now - r.at <= ECHO_WINDOW_MS)
  if (i === -1) return false
  recentLocal.splice(i, 1)
  return true
}

/** Raise a reward toast that arrived from elsewhere, without recording it as local. */
export function showRemoteRewardToast(reward: ZapReward) {
  if (typeof window === 'undefined' || reward.amount <= 0) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...reward, source: 'remote' } }))
}
