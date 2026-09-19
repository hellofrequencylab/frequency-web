'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { getJourneySellData, type JourneySellData } from '@/app/(main)/journeys/admin-actions'
import { setJourneyPriceAction, unsetJourneyPriceAction } from '@/app/(main)/journeys/[slug]/sell-actions'
import { buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'

// "Sell this Journey" (ADR-1397): the one control that puts a price on a Journey, and the only caller
// of setJourneyPriceAction. Without it the action was unreachable and the whole selling path was
// theory.
//
// ⚠️ IT RENDERS FOR SOMEONE WHO MAY NOT SELL, ON PURPOSE. A Space editor on a FREE Space passes
// journey.editSettings, so hiding the module would answer "why can't I sell this?" with silence. It
// shows the upsell line the gate returned instead. The gate is still the authority: every write
// re-asks checkJourneySell, so this is parity, never permission.

export function JourneySellModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/journeys\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<JourneySellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dollars, setDollars] = useState('')
  const [listInMarket, setListInMarket] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = (s: string) =>
    getJourneySellData(s)
      .then((d) => {
        setData(d)
        if (d?.offer) {
          setDollars(String(d.offer.priceCents / 100))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

  useEffect(() => {
    if (!slug) return
    void load(slug)
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-20 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const save = () => {
    setError(null)
    const cents = Math.round(Number(dollars) * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Enter a price above zero.')
      return
    }
    startTransition(async () => {
      const res = await setJourneyPriceAction({ planId: data.planId, slug: data.slug, priceCents: cents, listInMarket })
      if ('error' in res) setError(res.error)
      else await load(data.slug)
    })
  }

  const stopSelling = () => {
    setError(null)
    startTransition(async () => {
      const res = await unsetJourneyPriceAction({ planId: data.planId, slug: data.slug })
      if ('error' in res) setError(res.error)
      else {
        setDollars('')
        await load(data.slug)
      }
    })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-elevated/50 p-4">
      <div>
        <h3 className="text-body-sm font-semibold text-text">Sell this Journey</h3>
        <p className="mt-0.5 text-meta leading-relaxed text-muted">
          Set a price and people pay to enrol. Free stays free.
        </p>
      </div>

      {!data.canSell ? (
        <p className="text-meta leading-relaxed text-muted">{data.reason}</p>
      ) : (
        <>
          <label className="block">
            <span className="text-meta font-medium text-text">Price</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="text-body-sm text-muted">$</span>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="decimal"
                value={dollars}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDollars(e.target.value)}
                placeholder="444"
                className="w-32"
              />
            </span>
          </label>

          <Checkbox
            checked={listInMarket}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setListInMarket(e.target.checked)}
            label="Also list it in the main Market"
            hint="Leave this off to sell only from this page and your Space's Shop."
          />

          {/* Seats are the author's existing enroll_cap, shown here because a price makes the number
              matter. It is not editable from this module: it lives in Settings, and two controls for
              one column is how they start disagreeing. */}
          {data.offer && (
            <p className="text-meta leading-relaxed text-muted">
              {data.offer.enrolled} enrolled
              {data.offer.enrollCap ? ` of ${data.offer.enrollCap} seats` : ''}.{' '}
              <Link href={`/journeys/${data.slug}`} className="font-medium text-primary-strong hover:underline">
                View the sales page
              </Link>
            </p>
          )}

          {error && <p className="text-meta leading-relaxed text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={pending} className={buttonClasses('primary', 'sm')}>
              {data.offer ? 'Update price' : 'Put it on sale'}
            </button>
            {data.offer && (
              <button type="button" onClick={stopSelling} disabled={pending} className={buttonClasses('secondary', 'sm')}>
                Stop selling
              </button>
            )}
          </div>

          {data.offer && (
            <p className="text-meta leading-relaxed text-muted">
              Changing the price writes a new product. People who already paid keep what they bought,
              and their receipts still show what they were charged.
            </p>
          )}
        </>
      )}
    </div>
  )
}
