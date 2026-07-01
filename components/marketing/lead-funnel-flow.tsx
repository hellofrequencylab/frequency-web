import { ArrowDown, ArrowRight } from 'lucide-react'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'

// The coach lead-funnel, drawn as one flow from the house illustration kit. Five
// library elements (components/marketing/illustrations) in order, each a feature,
// joined by arrows: found on the Spotlight page → book online → captured in the
// CRM → automated follow-up → into the pipeline. Server Component, semantic tokens
// only, so it reads in light and dark. Copy follows CONTENT-VOICE (plain, honest,
// no em dashes); the arrows are decorative (aria-hidden), the labels carry meaning.
//
// The steps are data (LEAD_FUNNEL_STEPS) so callers — including the Puck block in
// components/page-editor/blocks/marketing.tsx — can pass their own edited labels and
// captions, pick any element from the kit, and flip between a horizontal and a
// vertical layout.

export type LeadFunnelStep = {
  illustration: IllustrationName
  label: string
  caption: string
}

export type LeadFunnelOrientation = 'horizontal' | 'vertical'

export const LEAD_FUNNEL_STEPS: readonly LeadFunnelStep[] = [
  { illustration: 'spotlight', label: 'Your Spotlight page', caption: 'Someone finds you and taps a link.' },
  { illustration: 'book', label: 'They book online', caption: 'They pick a time. No back-and-forth.' },
  { illustration: 'capture', label: 'Saved to your CRM', caption: 'The contact lands in your list.' },
  { illustration: 'nurture', label: 'Follow-up runs itself', caption: 'A friendly sequence goes out on time.' },
  { illustration: 'pipeline', label: 'Into your pipeline', caption: 'You watch each lead move toward booked.' },
] as const

const BADGE =
  'absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary'

function StepCard({
  step,
  n,
  vertical,
  showNumbers,
}: {
  step: LeadFunnelStep
  n: number
  vertical: boolean
  showNumbers: boolean
}) {
  if (vertical) {
    // A row: element on the left, text on the right, left-aligned.
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="relative flex h-20 w-24 flex-none items-center justify-center">
          <Illustration name={step.illustration} className="h-full" />
          {showNumbers && <span className={BADGE}>{n}</span>}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base uppercase leading-tight text-text">{step.label}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{step.caption}</p>
        </div>
      </div>
    )
  }
  // A centered column card.
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl border border-border bg-surface p-5 text-center shadow-sm">
      <div className="relative mb-4 flex h-24 w-full items-center justify-center">
        <Illustration name={step.illustration} className="h-full" animate />
        {showNumbers && <span className={BADGE}>{n}</span>}
      </div>
      <h3 className="font-display text-lg uppercase leading-tight text-text">{step.label}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{step.caption}</p>
    </div>
  )
}

function Connector({ vertical }: { vertical: boolean }) {
  if (vertical) {
    return (
      <div className="flex justify-center py-1 text-subtle" aria-hidden>
        <ArrowDown className="h-5 w-5" />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center py-2 text-subtle lg:px-1 lg:py-0" aria-hidden>
      <ArrowDown className="h-5 w-5 lg:hidden" />
      <ArrowRight className="hidden h-5 w-5 lg:block" />
    </div>
  )
}

/**
 * The full funnel infographic: the feature elements arranged as a connected flow.
 *
 * - `horizontal` (default): runs left to right from `lg` up, stacking with down
 *   arrows on small screens.
 * - `vertical`: always a top-to-bottom stack of rows — good for a narrow column or
 *   a tall info panel.
 *
 * Pass `steps` to edit the labels/captions or reorder; omit for the canonical five.
 */
export function LeadFunnelFlow({
  steps = LEAD_FUNNEL_STEPS,
  orientation = 'horizontal',
  showNumbers = true,
  className,
}: {
  steps?: readonly LeadFunnelStep[]
  orientation?: LeadFunnelOrientation
  showNumbers?: boolean
  className?: string
}) {
  const vertical = orientation === 'vertical'
  return (
    <div
      className={`flex flex-col gap-4 ${vertical ? 'mx-auto max-w-md' : 'lg:flex-row lg:items-stretch'} ${className ?? ''}`.trim()}
    >
      {steps.map((step, i) => (
        <div
          key={`${step.illustration}-${i}`}
          className={vertical ? 'flex flex-col' : 'flex flex-col lg:flex-1 lg:flex-row lg:items-center'}
        >
          <StepCard step={step} n={i + 1} vertical={vertical} showNumbers={showNumbers} />
          {i < steps.length - 1 && <Connector vertical={vertical} />}
        </div>
      ))}
    </div>
  )
}
