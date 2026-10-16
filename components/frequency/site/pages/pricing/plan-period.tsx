'use client'

// The Monthly / Yearly switch on the Frequency pricing page. It holds no prices: every plan card
// renders both figures at build time, each in a `data-period-show` span, and this island only writes
// `data-period` on its wrapper so the kit CSS shows the matching one. Default monthly, a labelled
// radiogroup, the same contract as the DAWN page's PricingIntervalScope.

import { createContext, useContext, useState } from 'react'

type Period = 'month' | 'year'

const PeriodContext = createContext<{ period: Period; setPeriod: (next: Period) => void } | null>(null)

/** Wrap every plan row whose figures flip. Server Components pass through as children. */
export function PlanPeriodScope({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<Period>('month')
  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      <div className="pb-scope" data-period={period}>
        {children}
      </div>
    </PeriodContext.Provider>
  )
}

/** The switch. Outside a scope there is nothing to flip, so it renders nothing. */
export function PlanPeriodSwitch({ note }: { note: string }) {
  const ctx = useContext(PeriodContext)
  if (!ctx) return null
  const { period, setPeriod } = ctx
  return (
    <div className="pb-period-wrap">
      <div className="pb-period" role="radiogroup" aria-label="Billing period">
        {(['month', 'year'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            className={period === p ? 'on' : undefined}
            onClick={() => setPeriod(p)}
          >
            {p === 'month' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>
      <p className="pb-period-note">{note}</p>
    </div>
  )
}
