'use client'

import { useEffect, useState, useTransition } from 'react'
import { Gem, Gift, Search, X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { isError } from '@/lib/action-result'
import { giftGemsAction, searchGiftRecipients, type GiftRecipient } from './actions'

// Gift Gems (Rewards Economy v3, ADR-305 / REWARDS-ECONOMY §8) — the member-facing
// entry point for the giftGemsAction backend. Search a member, choose an amount, send.
// The server action is the authority: it revalidates the balance under an advisory lock
// and never loses Gems, so this UI stays a thin, friendly wrapper.

export function GiftGemsDialog({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GiftRecipient[]>([])
  const [searchedTerm, setSearchedTerm] = useState('')
  const [recipient, setRecipient] = useState<GiftRecipient | null>(null)
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Debounced recipient search. Only runs while typing with no one selected. All state
  // writes happen inside the (async) timer callback so nothing sets state synchronously
  // during the effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (recipient) return
    const term = query.trim()
    let cancelled = false
    const t = setTimeout(async () => {
      const found = term.length < 2 ? [] : await searchGiftRecipients(term)
      if (!cancelled) {
        setResults(found)
        setSearchedTerm(term)
      }
    }, term.length < 2 ? 0 : 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, recipient])

  // Derived (no state write): we're mid-search while the typed term hasn't been resolved yet.
  const searching = query.trim().length >= 2 && query.trim() !== searchedTerm

  const parsedAmount = Number(amount)
  const amountValid =
    Number.isInteger(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance
  const canSend = !!recipient && amountValid && !isPending

  function reset() {
    setQuery('')
    setResults([])
    setRecipient(null)
    setAmount('')
    setResult(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function handleSend() {
    if (!recipient || !amountValid) return
    startTransition(async () => {
      const res = await giftGemsAction(recipient.id, parsedAmount)
      if (isError(res)) {
        setResult({ text: res.error, ok: false })
      } else {
        const name = recipient.displayName || (recipient.handle ? `@${recipient.handle}` : 'them')
        setResult({ text: `Sent ${res.data.amount} Gems to ${name}.`, ok: true })
      }
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="whitespace-nowrap">
        <Gift className="h-4 w-4" aria-hidden />
        Gift Gems
      </Button>
    )
  }

  return (
    <Dialog open={open} onClose={close} ariaLabel="Gift Gems" className="max-w-md">
      <div className="w-full rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Gift className="h-4 w-4 text-primary-strong" aria-hidden />
            Gift Gems
          </h2>
          <button onClick={close} aria-label="Close" className="rounded p-1 text-subtle hover:text-muted dark:hover:text-subtle">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {result?.ok ? (
            <div className="py-4 text-center">
              <Check className="mx-auto mb-2 h-8 w-8 text-success" aria-hidden />
              <p className="text-sm text-text">{result.text}</p>
              <button
                onClick={reset}
                className="mt-3 text-xs font-medium text-primary-strong hover:text-primary-strong"
              >
                Gift more
              </button>
            </div>
          ) : (
            <>
              <p className="flex items-center gap-1 text-xs text-subtle">
                <Gem className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
                You have {balance} Gems to spend.
              </p>

              {/* Recipient picker */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">To</label>
                {recipient ? (
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="flex-1 text-sm text-text">
                      {recipient.displayName || 'Member'}
                    </span>
                    {recipient.handle && <span className="text-xs text-subtle">@{recipient.handle}</span>}
                    <button
                      onClick={() => setRecipient(null)}
                      aria-label="Clear recipient"
                      className="text-subtle hover:text-muted"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search members"
                        aria-label="Search members"
                        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-border-strong/30"
                      />
                    </div>
                    {query.trim().length >= 2 && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface">
                        {searching ? (
                          <p className="flex items-center gap-2 px-3 py-2 text-xs text-subtle">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Searching
                          </p>
                        ) : results.length > 0 ? (
                          results.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setRecipient(m)
                                setQuery('')
                                setResults([])
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-canvas"
                            >
                              <span className="text-sm text-text">{m.displayName || 'Member'}</span>
                              {m.handle && <span className="text-xs text-subtle">@{m.handle}</span>}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-xs text-subtle">No members found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="gift-amount" className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Amount
                </label>
                <input
                  id="gift-amount"
                  type="number"
                  min={1}
                  max={balance}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="How many Gems"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-border-strong/30"
                />
                {amount.trim() !== '' && !amountValid && (
                  <p className="mt-1 text-xs text-danger">
                    {parsedAmount > balance
                      ? `You have ${balance} Gems to spend.`
                      : 'Enter a whole number of Gems greater than zero.'}
                  </p>
                )}
              </div>

              {result && !result.ok && <p className="text-xs text-danger">{result.text}</p>}

              <Button onClick={handleSend} disabled={!canSend} className="w-full py-2">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Gift className="h-3.5 w-3.5" aria-hidden />}
                Send Gems
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
