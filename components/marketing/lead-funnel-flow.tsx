import { ArrowDown, ArrowRight } from 'lucide-react'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'

// The coach lead-funnel, drawn as one flow from the house illustration kit. Five
// library elements (components/marketing/illustrations) in order, each a feature,
// joined by arrows: found on the Spotlight page → book online → captured in the
// CRM → automated follow-up → into the pipeline. Server Component, semantic tokens
// only, so it reads in light and dark. Copy follows CONTENT-VOICE (plain, honest,
// no em dashes); the arrows are decorative (aria-hidden), the labels carry meaning.

export type LeadFunnelStep = {
  n: number
  illustration: IllustrationName
  label: string
  caption: string
}

export const LEAD_FUNNEL_STEPS: readonly LeadFunnelStep[] = [
  { n: 1, illustration: 'spotlight', label: 'Your Spotlight page', caption: 'Someone finds you and taps a link.' },
  { n: 2, illustration: 'book', label: 'They book online', caption: 'They pick a time. No back-and-forth.' },
  { n: 3, illustration: 'capture', label: 'Saved to your CRM', caption: 'The contact lands in your list.' },
  { n: 4, illustration: 'nurture', label: 'Follow-up runs itself', caption: 'A friendly sequence goes out on time.' },
  { n: 5, illustration: 'pipeline', label: 'Into your pipeline', caption: 'You watch each lead move toward booked.' },
] as const

/**
 * The full funnel infographic: the five feature elements arranged as a connected
 * flow. Stacks vertically on small screens (down arrows) and runs left to right
 * from `lg` up (right arrows). Fills its container's width; give it room to breathe.
 */
export function LeadFunnelFlow({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-4 lg:flex-row lg:items-stretch ${className ?? ''}`.trim()}>
      {LEAD_FUNNEL_STEPS.map((step, i) => (
        <div key={step.illustration} className="flex flex-col lg:flex-1 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col items-center rounded-2xl border border-border bg-surface p-5 text-center shadow-sm">
            <div className="relative mb-4 flex h-24 w-full items-center justify-center">
              <Illustration name={step.illustration} className="h-full" animate />
              <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
                {step.n}
              </span>
            </div>
            <h3 className="font-display text-lg uppercase leading-tight text-text">{step.label}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{step.caption}</p>
          </div>
          {i < LEAD_FUNNEL_STEPS.length - 1 && (
            <div className="flex items-center justify-center py-2 text-subtle lg:px-1 lg:py-0" aria-hidden>
              <ArrowDown className="h-5 w-5 lg:hidden" />
              <ArrowRight className="hidden h-5 w-5 lg:block" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
