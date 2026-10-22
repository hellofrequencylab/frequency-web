// THE ADD-ONS AND FEES (owner 2026-10-21): every extra a plan can be topped up with and every rule about what
// Frequency earns on a sale, listed plainly under the plan cards. Server Component. Every figure arrives
// from lib/pricing/pricing-addons.ts and the Offering model; there is no typed money in this file.
import Link from 'next/link'
import { addOnHref, addOnLabel } from '@/lib/pricing/addon-links'
import { formatBps } from '@/lib/pricing/display'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import type { AddOnGroups, AddOnRow } from '@/lib/pricing/pricing-addons'
import type { Offering } from '@/lib/pricing/pricing-grid'
import { splitPrice } from './split-price'

function AddOnCard({ row }: { row: AddOnRow }) {
  const { lead, amount, per } = splitPrice(row.price)
  const href = addOnHref(row.key)
  const label = addOnLabel(row.key)
  return (
    <li className="pa-card">
      <h4>{row.name}</h4>
      <p className="pa-price">
        {lead && <small>{lead}</small>}
        <b>{amount}</b>
        {per && <small>{per}</small>}
      </p>
      {row.unit && <p className="pa-unit">{row.unit}</p>}
      <p className="pa-detail">{row.detail}</p>
      <p className="pa-who">
        <span>Who</span>
        {row.who}
      </p>
      {href && label && (
        <p className="pa-cta">
          <Link href={href} className="btn btn-ghost">
            {label}
          </Link>
        </p>
      )}
    </li>
  )
}

/** The rate each plan pays Frequency on a customer Frequency introduced. A zero always carries its caveat. */
function feeText(bps: number): string {
  return bps > 0
    ? `${formatBps(bps)}, once, on a customer Frequency introduces`
    : `${formatBps(bps)} on a customer Frequency introduces, ${PLAN_STORY.plusProcessing}`
}

export function PricingAddOns({ addOns, spaces }: { addOns: AddOnGroups; spaces: readonly Offering[] }) {
  const fees = ['business', 'collective', 'network', 'nonprofit'].flatMap((id) => {
    const o = spaces.find((s) => s.id === id)
    return o && o.sells ? [{ id, label: o.label, bps: o.networkRateBps }] : []
  })
  return (
    <>
      <section className="sec pb-sec" id="addons" data-screen-label="02c Add-ons">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Add-ons</b>Everything you can add
            </div>
            <h2 className="h-l">Add-ons and extras, with their prices.</h2>
            <p className="pb-note">
              Every plan already runs the whole product. These are the extras you can add, and the things that come
              with a plan and are never sold on their own.
            </p>
          </div>
          <h3 className="pa-h">Add to a plan</h3>
          <ul className="pa-grid">
            {addOns.paid.map((row) => (
              <AddOnCard key={row.key} row={row} />
            ))}
          </ul>
          <h3 className="pa-h">Comes with the plan</h3>
          <ul className="pa-grid">
            {addOns.included.map((row) => (
              <AddOnCard key={row.key} row={row} />
            ))}
          </ul>
        </div>
      </section>

      <section className="sec pb-sec" id="sales" data-screen-label="02d What we earn">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>What you pay on sales</b>Only on introductions
            </div>
            <h2 className="h-l">{`We only earn on a customer we introduce. Your own people are 0% on every plan, ${PLAN_STORY.plusProcessing}.`}</h2>
            <p className="pb-note">{PLAN_STORY.rate}</p>
          </div>
          <ul className="pa-fees">
            {fees.map((f) => (
              <li key={f.id}>
                <b>{f.label}</b>
                <span>{feeText(f.bps)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
