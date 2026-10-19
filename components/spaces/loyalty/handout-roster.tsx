'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { handOutReward } from '@/lib/loyalty/actions'
import { formatCode, formatRewardValue, type LoyaltyReward } from '@/lib/loyalty/program'

// REWARDS TO HAND OUT (LIVE-940). The counter view: type the six-character code a member shows, or tap
// "Handed out" on their row. Both run the owner-gated handOutReward action. No em dashes.

export function HandoutRoster({
  spaceId,
  rewards,
}: {
  spaceId: string
  rewards: (LoyaltyReward & { name: string })[]
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function mark(c: string) {
    setMessage(null)
    start(async () => {
      const result = await handOutReward(spaceId, c)
      if (isError(result)) {
        setMessage({ tone: 'bad', text: result.error })
        return
      }
      setMessage({ tone: 'ok', text: result.data === 'already' ? 'That one was already handed out.' : 'Handed out.' })
      setCode('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending && code.trim()) mark(code)
        }}
      >
        <div className="flex-1">
          <Label htmlFor="loyalty-code">Code from the member</Label>
          <Input
            id="loyalty-code"
            value={code}
            placeholder="K7Q 2MX"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <Button type="submit" disabled={pending || !code.trim()}>
          <Gift className="h-4 w-4" aria-hidden /> Handed out
        </Button>
      </form>
      {message && (
        <p
          role="status"
          className={`rounded-card px-3 py-2 text-body-sm font-medium ${
            message.tone === 'ok' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {message.text}
        </p>
      )}

      {rewards.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No rewards waiting."
          description="When a member fills their card, their name and code show here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
          {rewards.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-semibold text-text">{r.name}</p>
                <p className="text-meta text-muted">
                  {r.rewardTitle}
                  {formatRewardValue(r.rewardValueCents) ? ` (${formatRewardValue(r.rewardValueCents)})` : ''} ·{' '}
                  <span className="font-mono font-semibold">{formatCode(r.code)}</span>
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => mark(r.code)}>
                <Check className="h-4 w-4" aria-hidden /> Handed out
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
