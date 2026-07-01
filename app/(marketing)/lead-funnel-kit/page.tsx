import type { Metadata } from 'next'
import { PageHero } from '@/components/marketing/marketing-ui'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'
import { LeadFunnelFlow } from '@/components/marketing/lead-funnel-flow'

// Preview / kit page for the coach lead-funnel vector set. Not a public marketing
// page: it exists so the team can see the new library elements and the composed
// funnel infographic in one place. noindex, so it never enters the sitemap. The art
// is the deliverable; the copy stays plain (CONTENT-VOICE) and light.
export const metadata: Metadata = {
  title: 'Lead-funnel vector kit',
  description: 'The coach lead-funnel illustration set and the flow it composes into.',
  robots: { index: false },
  alternates: { canonical: '/lead-funnel-kit' },
}

// Each library element and the feature it stands for. Names match illustrationNames
// in components/marketing/illustrations, so they double as the reusable dropdown set.
const ELEMENTS: { name: IllustrationName; feature: string; note: string }[] = [
  { name: 'spotlight', feature: 'Spotlight page', note: 'A coach is found on their public mini-site and taps a link.' },
  { name: 'book', feature: 'Book online', note: 'The visitor picks a time slot and confirms it themselves.' },
  { name: 'capture', feature: 'CRM capture', note: 'The new contact drops straight into the member list, saved.' },
  { name: 'nurture', feature: 'Automated follow-up', note: 'A friendly sequence sends on schedule, on its own.' },
  { name: 'pipeline', feature: 'Lead pipeline', note: 'Each lead moves through stages toward a booked deal.' },
]

export default function LeadFunnelKitPage() {
  return (
    <>
      <PageHero
        eyebrow="Illustration kit"
        title={
          <>
            The coach <span className="text-primary">lead funnel</span>
          </>
        }
        subtitle="Five vector elements, one per feature, drawn in the house style. Reusable on their own, or brought together into the flow below."
      />

      {/* The composed infographic — full flow, wider than the reading column. */}
      <section className="bg-marketing-canvas px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <LeadFunnelFlow />
          <p className="mt-8 text-center text-sm text-subtle">
            Found on your Spotlight page, booked online, saved to your CRM, followed up automatically, and tracked to booked.
          </p>
        </div>
      </section>

      {/* The library — each element on its own, with the feature it represents. */}
      <section className="bg-surface px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-9 text-center font-display text-[clamp(1.5rem,4vw,2.25rem)] uppercase text-text">
            The elements
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ELEMENTS.map((el) => (
              <div key={el.name} className="flex flex-col rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
                <div className="mb-4 flex h-28 items-center justify-center">
                  <Illustration name={el.name} className="h-full" />
                </div>
                <h3 className="font-display text-xl uppercase text-text">{el.feature}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-primary-strong">{el.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{el.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
