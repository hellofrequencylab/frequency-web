'use client'

import { useState, useTransition } from 'react'
import { Gem, Zap, PlusCircle, MinusCircle, Loader2 } from 'lucide-react'
import { grantGems, revokeGems, grantZaps, revokeZaps } from './economy-actions'

type Currency = 'gems' | 'zaps'
type Op = 'grant' | 'revoke'

interface Props {
  profileId: string
  displayName: string
}

export function EconomyPanel({ profileId, displayName }: Props) {
  const [currency, setCurrency] = useState<Currency>('gems')
  const [op, setOp] = useState<Op>('grant')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setStatus({ ok: false, msg: 'Enter a positive whole number.' }); return }
    if (!reason.trim()) { setStatus({ ok: false, msg: 'Reason is required.' }); return }

    startTransition(async () => {
      try {
        if (currency === 'gems' && op === 'grant') await grantGems(profileId, n, reason)
        if (currency === 'gems' && op === 'revoke') await revokeGems(profileId, n, reason)
        if (currency === 'zaps' && op === 'grant') await grantZaps(profileId, n, reason)
        if (currency === 'zaps' && op === 'revoke') await revokeZaps(profileId, n, reason)
        const verb = op === 'grant' ? 'Granted' : 'Revoked'
        setStatus({ ok: true, msg: `${verb} ${n} ${currency} ${op === 'grant' ? 'to' : 'from'} ${displayName}.` })
        setAmount('')
        setReason('')
      } catch (err) {
        setStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  const CurrencyIcon = currency === 'gems' ? Gem : Zap
  const currencyColor = currency === 'gems' ? 'text-signal' : 'text-primary'

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
      <p className="text-xs font-bold text-text flex items-center gap-1.5">
        <CurrencyIcon className={`w-3.5 h-3.5 ${currencyColor}`} />
        Economy adjustment
      </p>

      {status && (
        <p className={`text-xs px-2 py-1.5 rounded-lg ${status.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
          {status.msg}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {/* Currency + op toggles */}
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {(['gems', 'zaps'] as Currency[]).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { setCurrency(c); setStatus(null) }}
                className={`px-3 py-1.5 capitalize transition-colors ${currency === c ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => { setOp('grant'); setStatus(null) }}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${op === 'grant' ? 'bg-success text-white' : 'text-muted hover:bg-surface-elevated'}`}
            >
              <PlusCircle className="w-3 h-3" /> Grant
            </button>
            <button
              type="button"
              onClick={() => { setOp('revoke'); setStatus(null) }}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${op === 'revoke' ? 'bg-danger text-white' : 'text-muted hover:bg-surface-elevated'}`}
            >
              <MinusCircle className="w-3 h-3" /> Revoke
            </button>
          </div>
        </div>

        {/* Amount + reason */}
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={amount}
            onChange={e => { setAmount(e.target.value); setStatus(null) }}
            placeholder="Amount"
            required
            className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-border-strong/30"
          />
          <input
            type="text"
            value={reason}
            onChange={e => { setReason(e.target.value); setStatus(null) }}
            placeholder="Reason (required)"
            required
            maxLength={200}
            className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-border-strong/30"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${op === 'grant' ? 'bg-success hover:bg-success' : 'bg-danger hover:bg-danger'}`}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : (op === 'grant' ? <PlusCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />)}
          {op === 'grant' ? `Grant ${currency}` : `Revoke ${currency}`}
        </button>
      </form>
    </div>
  )
}
