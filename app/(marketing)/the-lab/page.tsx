import type { Metadata } from 'next'
import { PageHero, Section, SectionHeading, Lead, Body, BetaCTA } from '@/components/marketing/marketing-ui'

export const metadata: Metadata = {
  title: 'The Lab',
  description:
    'The Frequency Lab is a third space engineered for your nervous system. Somewhere to move, gather, cool down, and come back to yourself.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab · Frequency',
    description:
      'A third space built to be felt: movement studios, a thermal circuit, a connection bar, and an events floor.',
    url: '/the-lab',
  },
}

const FEATURES = [
  {
    img: '/images/site/lab-thermal.jpg',
    title: 'The thermal circuit',
    body: 'Sauna and cold plunge. The contrast at the center of it all.',
  },
  {
    img: '/images/site/lab-pool.jpg',
    title: 'Movement studios',
    body: 'Breathwork, yoga, and somatic practice. The daily reset.',
  },
  {
    img: '/images/site/lab-lounge.jpg',
    title: 'The connection bar',
    body: 'Coffee and conversation, where strangers become regulars.',
  },
  {
    img: '/images/site/lab-concept.jpg',
    title: 'The events floor',
    body: 'Talks, sound, ceremony, and celebration when the community gathers.',
  },
]

export default function TheLabPage() {
  return (
    <>
      <PageHero
        eyebrow="The third space"
        title="A place built to be felt."
        subtitle="The Frequency Lab is a third space engineered for your nervous system. Somewhere to move, gather, cool down, and come back to yourself."
      />

      {/* Hero render */}
      <div className="px-6">
        <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm">
          <img
            src="/images/site/lab-storefront.jpg"
            alt="Concept render of a Frequency Lab storefront hosting a movement class"
            className="w-full object-cover aspect-[21/9]"
          />
        </div>
      </div>

      <Section tone="canvas">
        <SectionHeading title="Not a gym. Not a café. Not a studio. All of it, on purpose." />
        <Lead>
          The Lab is a single space designed to do what scattered places
          can&apos;t: hold a whole arc of a day.
        </Lead>
        <Body>
          Arrive frazzled, leave regulated. Come alone, leave known. The
          environment does the work. Light, sound, temperature, and the people
          around you all tuned to bring you back to yourself.
        </Body>
      </Section>

      {/* Feature tiles with imagery */}
      <section className="bg-surface px-6 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              Inside
            </p>
            <h2 className="font-display uppercase text-text text-5xl sm:text-6xl">
              What you&apos;ll find
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl overflow-hidden border border-border bg-surface hover:border-border-strong transition-colors"
              >
                <img
                  src={f.img}
                  alt={f.title}
                  loading="lazy"
                  className="w-full object-cover aspect-[16/10]"
                />
                <div className="p-6">
                  <h3 className="text-xl font-bold text-text mb-1.5">{f.title}</h3>
                  <p className="text-base text-muted leading-relaxed">{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Section tone="canvas">
        <SectionHeading title="Designed to spread." />
        <Body>
          The first Lab is a prototype, a flagship rooted in one neighborhood.
          It&apos;s built so that what works here can open in your city next.
          The community comes first; the Lab is where it gets a body.
        </Body>
      </Section>

      <BetaCTA
        heading="Be part of building it."
        body="The community is how the Lab begins. Join the Beta and help it take shape."
      />
    </>
  )
}
