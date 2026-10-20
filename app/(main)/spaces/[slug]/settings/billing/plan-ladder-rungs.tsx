'use client'

import { useState } from 'react'
import { Check, Globe, Network, ShieldCheck, Users } from 'lucide-react'
import type { BillingInterval } from '@/lib/billing/pricing-keys'
import type { SpacePlan } from '@/lib/pricing/plans'
import { TierChip } from '@/components/pricing/tier-chip'
import { ChoosePlanButton } from './choose-plan'
import { BillingIntervalSwitch } from './interval-switch'

// THE LADDER'S RUNG LIST (client, LIVE-990). plan-ladder.tsx stays a Server Component and resolves every
// price through the catalog (server-only modules); this island only holds the Monthly / Yearly choice
// and draws the rows it was handed. A rung carries BOTH labels so switching never asks the server for a
// number, and the Choose button sends the chosen interval to the checkout. Icons are named here, not
// passed, because a component is not a serialisable prop.

export type RungIcon = 'check' | 'users' | 'network' | 'shield' | 'globe'

const ICONS: Record<RungIcon, typeof Check> = {
  check: Check,
  users: Users,
  network: Network,
  shield: ShieldCheck,
  globe: Globe,
}

export interface LadderRung {
  plan: SpacePlan
  icon: RungIcon
  label: string
  blurb: string
  /** The price labels per interval ("$49/mo", "$490/yr"), or "Free". */
  price: Record<BillingInterval, string>
  /** The Founding note per interval, or null when the rung is charged at list. */
  note: Record<BillingInterval, string | null>
  /** The state chip, or null when the rung carries a Choose button instead. */
  chip: { label: string; className: string } | null
  /** The plan the Choose button buys, when this rung is choosable by this Space. */
  choose: 'business' | 'collective' | 'network' | null
}

export function PlanLadderRungs({
  rungs,
  slug,
  initialInterval = 'month',
}: {
  rungs: LadderRung[]
  slug?: string
  initialInterval?: BillingInterval
}) {
  const [interval, setInterval] = useState<BillingInterval>(initialInterval)
  const anyChoose = !!slug && rungs.some((r) => r.choose)
  return (
    <>
      {anyChoose && (
        <div className="mt-4">
          <BillingIntervalSwitch value={interval} onChange={setInterval} />
        </div>
      )}
      <ul className="mt-4 space-y-2.5">
        {rungs.map((rung) => {
          const Icon = ICONS[rung.icon]
          const note = rung.note[interval]
          return (
            <li
              key={rung.plan}
              className="flex items-start gap-3 rounded-card border border-border bg-surface-elevated/40 px-4 py-3"
            >
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary-bg/40">
                <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <TierChip tier={rung.plan} size="md" />
                  <span className="text-body-sm font-semibold text-text">{rung.price[interval]}</span>
                  {note && <span className="text-2xs font-medium text-primary-strong">{note}</span>}
                </div>
                <p className="mt-0.5 text-meta leading-relaxed text-muted">{rung.blurb}</p>
              </div>
              {rung.choose && slug ? (
                <ChoosePlanButton slug={slug} plan={rung.choose} interval={interval} label={`Choose ${rung.label}`} />
              ) : rung.chip ? (
                <span className={`shrink-0 self-center rounded-md px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${rung.chip.className}`}>
                  {rung.chip.label}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
