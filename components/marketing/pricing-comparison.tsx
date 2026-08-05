import {
  COMPARISON_GROUPS,
  competitorMonthlyTotal,
  comparisonToolCount,
  monthlySaving,
  yearlySaving,
  FREQUENCY_BUSINESS_MONTHLY,
  FREQUENCY_ALL_IN_MONTHLY,
  COMPARISON_DISCLAIMER,
  type ComparisonRow as CatalogRow,
} from '@/lib/pricing/comparison'
import {
  ComparisonTable,
  type ComparisonColumn,
  type ComparisonGroup,
  type ComparisonRow,
} from '@/components/marketing/comparison-table'

// THE VALUE COMPARISON section for the pricing page. Feature by feature, the separate tool a business would
// otherwise buy and its typical monthly price, set against Frequency's one flat price. Reads the PURE
// catalog (lib/pricing/comparison), so the total never drifts from the rows. Semantic DAWN tokens only, no
// hex; voice-canon copy, no em dashes.
//
// This file used to draw its own table AND its own mobile stack. It now ADAPTS the catalog onto the one
// shared renderer (components/marketing/comparison-table.tsx), which the plan matrix on the same page also
// composes. A ledger reads row-first on a phone, so it asks for `mobile="by-row"`; that is the only thing
// it says about presentation.

const money = (n: number) => `$${n.toLocaleString('en-US')}`

/** The columns: what a business pays elsewhere, against the one answer column. */
const COLUMNS: ComparisonColumn[] = [
  { id: 'separately', label: 'Pay for it separately' },
  { id: 'frequency', label: 'On Frequency', align: 'right', emphasis: true },
]

/** The competitor price cell: a monthly figure, or a plain label for a fee-based / no-equivalent row. */
function competitorPrice(row: CatalogRow): React.ReactNode {
  if (row.competitorMonthly == null) {
    return row.competitor === 'No real equivalent' ? 'Not for sale' : 'Fees'
  }
  return (
    <span className="whitespace-nowrap font-display font-normal text-text text-lead leading-none">
      {money(row.competitorMonthly)}
      <span className="text-body-sm font-normal text-subtle">/mo</span>
    </span>
  )
}

function toGroups(): ComparisonGroup[] {
  return COMPARISON_GROUPS.map((group) => ({
    key: group.title,
    label: group.title,
    rows: group.rows.map((row) => ({
      key: row.feature,
      label: row.feature,
      detail: row.ours,
      cells: [
        { kind: 'value' as const, text: competitorPrice(row), lead: row.competitor, sub: row.note },
        { kind: 'yes' as const, text: 'Included' },
      ],
    })),
  }))
}

/** The totals row: the whole stack, against the one flat price. */
function toFooter(total: number, tools: number): ComparisonRow {
  return {
    key: 'total',
    label: 'The whole stack',
    detail: `${tools} separate tools, ${tools} logins, ${tools} bills`,
    cells: [
      {
        kind: 'value',
        text: (
          <span className="whitespace-nowrap font-display font-normal text-text text-page-title leading-none">
            {money(total)}
            <span className="text-body-sm font-normal text-subtle">/mo and up</span>
          </span>
        ),
        sub: 'Before per-seat charges and transaction fees',
      },
      {
        kind: 'value',
        text: (
          <span className="whitespace-nowrap font-display font-normal text-primary-strong text-3xl leading-none">
            {money(FREQUENCY_BUSINESS_MONTHLY)}
            <span className="text-body-sm font-normal text-muted">/mo</span>
          </span>
        ),
        sub: (
          <span className="font-semibold text-primary-strong">
            Everything on: {money(FREQUENCY_ALL_IN_MONTHLY)}/mo
          </span>
        ),
      },
    ],
  }
}

export function PricingComparison() {
  const total = competitorMonthlyTotal()
  const tools = comparisonToolCount()
  const saveMonth = monthlySaving()
  const saveYear = yearlySaving()

  return (
    <div>
      <ComparisonTable
        caption="Every Frequency Business feature, the separate tool it replaces, and that tool’s typical price"
        rowHeader="What you get"
        columns={COLUMNS}
        groups={toGroups()}
        footer={toFooter(total, tools)}
        mobile="by-row"
      />

      {/* The saving line + the honesty caveat. */}
      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="text-lg leading-relaxed text-text sm:text-xl">
          That is <span className="font-bold text-primary-strong">{money(saveMonth)} a month</span>, about{' '}
          <span className="font-bold text-primary-strong">{money(saveYear)} a year</span>, and {tools} fewer
          logins. All of it runs together on Frequency, from {money(FREQUENCY_BUSINESS_MONTHLY)} a month.
        </p>
        <p className="mt-4 text-meta leading-relaxed text-subtle">{COMPARISON_DISCLAIMER}</p>
      </div>
    </div>
  )
}
