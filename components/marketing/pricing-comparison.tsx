import { Check } from 'lucide-react'
import {
  COMPARISON_GROUPS,
  competitorMonthlyTotal,
  comparisonToolCount,
  monthlySaving,
  yearlySaving,
  FREQUENCY_BUSINESS_MONTHLY,
  FREQUENCY_ALL_IN_MONTHLY,
  COMPARISON_DISCLAIMER,
  type ComparisonRow,
} from '@/lib/pricing/comparison'

// THE VALUE COMPARISON section for the pricing page. Feature by feature, the separate tool a business would
// otherwise buy and its typical monthly price, set against Frequency's one flat price. Desktop = a real
// table; mobile = stacked cards. Reads the PURE catalog (lib/pricing/comparison), so the total never drifts
// from the rows. Semantic DAWN tokens only, no hex; voice-canon copy, no em dashes.

const money = (n: number) => `$${n.toLocaleString('en-US')}`

/** The competitor price cell: a monthly figure, or a plain label for a fee-based / no-equivalent row. */
function CompetitorPrice({ row }: { row: ComparisonRow }) {
  if (row.competitorMonthly == null) {
    return <span className="font-semibold text-text">{row.competitor === 'No real equivalent' ? 'Not for sale' : 'Fees'}</span>
  }
  return (
    <span className="whitespace-nowrap font-display text-text text-xl leading-none">
      {money(row.competitorMonthly)}
      <span className="text-sm font-normal text-subtle">/mo</span>
    </span>
  )
}

export function PricingComparison() {
  const total = competitorMonthlyTotal()
  const tools = comparisonToolCount()
  const saveMonth = monthlySaving()
  const saveYear = yearlySaving()

  return (
    <div>
      {/* Desktop table. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
        <table className="w-full text-left">
          <caption className="sr-only">
            Every Frequency Business feature, the separate tool it replaces, and that tool&rsquo;s typical price
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th scope="col" className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-subtle">
                What you get
              </th>
              <th scope="col" className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-subtle">
                Pay for it separately
              </th>
              <th scope="col" className="px-5 py-4 text-right text-sm font-bold uppercase tracking-wider text-primary-strong">
                On Frequency
              </th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {COMPARISON_GROUPS.map((group) => (
              <GroupRows key={group.title} title={group.title} rows={group.rows} />
            ))}
            {/* The total. */}
            <tr className="border-t-2 border-border bg-surface-elevated">
              <th scope="row" className="px-5 py-5 align-top">
                <span className="block font-display uppercase text-text text-xl">The whole stack</span>
                <span className="mt-0.5 block text-xs text-subtle">{tools} separate tools, {tools} logins, {tools} bills</span>
              </th>
              <td className="px-5 py-5 align-top">
                <span className="font-display text-text text-2xl leading-none">{money(total)}</span>
                <span className="text-sm text-subtle">/mo and up</span>
                <span className="mt-0.5 block text-xs text-subtle">Before per-seat charges and transaction fees</span>
              </td>
              <td className="px-5 py-5 text-right align-top">
                <span className="font-display text-primary-strong text-3xl leading-none">
                  {money(FREQUENCY_BUSINESS_MONTHLY)}
                </span>
                <span className="text-sm text-muted">/mo</span>
                <span className="mt-0.5 block text-xs font-semibold text-primary-strong">
                  Everything on: {money(FREQUENCY_ALL_IN_MONTHLY)}/mo
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards, one per group. */}
      <div className="space-y-6 lg:hidden">
        {COMPARISON_GROUPS.map((group) => (
          <div key={group.title} className="overflow-hidden rounded-2xl border border-border">
            <p className="border-b border-border bg-surface-elevated px-4 py-3 font-display uppercase text-text">
              {group.title}
            </p>
            <ul className="divide-y divide-border">
              {group.rows.map((row) => (
                <li key={row.feature} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{row.feature}</p>
                    <p className="mt-0.5 text-xs text-muted">{row.competitor}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <CompetitorPrice row={row} />
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Included
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="rounded-2xl border-2 border-primary bg-primary-bg/20 p-5 text-center">
          <p className="font-display uppercase text-text text-xl">The whole stack</p>
          <p className="mt-1 text-sm text-subtle">{tools} tools, before per-seat charges and fees</p>
          <p className="mt-3 font-display text-text text-3xl">
            {money(total)}<span className="text-base text-subtle">/mo</span>
          </p>
          <p className="mt-2 text-sm font-bold uppercase tracking-wider text-primary-strong">On Frequency</p>
          <p className="font-display text-primary-strong text-4xl">
            {money(FREQUENCY_BUSINESS_MONTHLY)}<span className="text-lg text-muted">/mo</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-primary-strong">
            Everything on: {money(FREQUENCY_ALL_IN_MONTHLY)}/mo
          </p>
        </div>
      </div>

      {/* The saving line + the honesty caveat. */}
      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="text-lg leading-relaxed text-text sm:text-xl">
          That is <span className="font-bold text-primary-strong">{money(saveMonth)} a month</span>, about{' '}
          <span className="font-bold text-primary-strong">{money(saveYear)} a year</span>, and {tools} fewer
          logins. All of it runs together on Frequency, from {money(FREQUENCY_BUSINESS_MONTHLY)} a month.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-subtle">{COMPARISON_DISCLAIMER}</p>
      </div>
    </div>
  )
}

/** One group: a spanning subhead row, then its feature rows. */
function GroupRows({ title, rows }: { title: string; rows: readonly ComparisonRow[] }) {
  return (
    <>
      <tr className="bg-surface">
        <th scope="colgroup" colSpan={3} className="px-5 pb-2 pt-6 text-xs font-bold uppercase tracking-[0.2em] text-primary-strong">
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.feature} className="border-b border-border last:border-0">
          <th scope="row" className="px-5 py-4 align-top font-normal">
            <span className="block font-semibold text-text">{row.feature}</span>
            <span className="mt-0.5 block text-xs text-muted">{row.ours}</span>
          </th>
          <td className="px-5 py-4 align-top">
            <span className="block text-muted">{row.competitor}</span>
            <span className="mt-1 block"><CompetitorPrice row={row} /></span>
            {row.note && <span className="mt-1 block text-xs text-subtle">{row.note}</span>}
          </td>
          <td className="px-5 py-4 text-right align-top">
            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
              <Check className="h-4 w-4 shrink-0" aria-hidden /> Included
            </span>
          </td>
        </tr>
      ))}
    </>
  )
}
