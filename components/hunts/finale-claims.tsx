'use client'

// The finale's taps on the player's Trail page (FH-031T): collect a reward, and check in at the Event
// stop once the host has marked you in. The server actions decide everything; this only posts the slug
// and which reward. Nothing here can claim, hold or buy a seat at the Event.
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  checkInAtFinaleAction,
  collectFinaleRewardAction,
  type FinaleActionState,
} from '@/app/(main)/hunts/[slug]/play/finale-actions'

const INITIAL: FinaleActionState = { status: 'idle', message: '' }

function CollectReward({ slug, reward }: { slug: string; reward: { key: string; title: string } }) {
  const [state, action, pending] = useActionState(collectFinaleRewardAction, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reward" value={reward.key} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Checking' : `Collect: ${reward.title}`}</Button>
      {state.message && <p role="status" className="text-body-sm">{state.message}</p>}
    </form>
  )
}

function CheckIn({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(checkInAtFinaleAction, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" disabled={pending}>{pending ? 'Checking' : 'Check in at the finale stop'}</Button>
      {state.message && <p role="status" className="text-body-sm">{state.message}</p>}
    </form>
  )
}

export function FinaleClaims({ slug, rewards, canCheckIn }: { slug: string; rewards: { key: string; title: string }[]; canCheckIn: boolean }) {
  if (rewards.length === 0 && !canCheckIn) return null
  return (
    <section aria-label="Finale stop and rewards" className="space-y-3">
      {canCheckIn && <CheckIn slug={slug} />}
      {rewards.map((r) => <CollectReward key={r.key} slug={slug} reward={r} />)}
    </section>
  )
}
