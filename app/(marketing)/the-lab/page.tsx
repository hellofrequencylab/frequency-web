import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { PageHero, ZigZag, Statement, BetaCTA } from '@/components/marketing/marketing-ui'
import { SiteImage } from '@/components/marketing/site-image'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

export const revalidate = 3600

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
    body: 'Sauna and cold plunge. The contrast that resets your whole system in twenty minutes.',
  },
  {
    img: '/images/site/lab-pool.jpg',
    title: 'Movement studios',
    body: 'Breathwork, yoga, and somatic practice. The daily reset, led by people who know what they’re doing.',
  },
  {
    img: '/images/site/lab-lounge.jpg',
    title: 'The connection bar',
    body: 'Coffee, tea, and real conversation. The lingering place, where strangers quietly become regulars.',
  },
  {
    img: '/images/site/lab-concept.jpg',
    title: 'The events floor',
    body: 'Talks, sound baths, ceremony, and celebration. Where the whole community comes together.',
  },
]

export default async function TheLabPage() {
  const data = await getPublishedData('the-lab')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyTheLab />
}

function LegacyTheLab() {
  return (
    <>
      <PageHero
        eyebrow="The third space"
        title={
          <>
            A place built to be <span className="text-primary">felt</span>.
          </>
        }
        subtitle="The Frequency Lab is a third space engineered for your nervous system. Somewhere to move, gather, cool down, and come back to yourself."
      />

      {/* Hero render */}
      <div className="px-6">
        <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden border border-border shadow-sm">
          <SiteImage
            src="/images/site/lab-storefront.jpg"
            alt="Concept render of a Frequency Lab storefront hosting a movement class"
            aspect="21/9"
            sizes="(min-width: 1024px) 64rem, 100vw"
            preload
          />
        </div>
      </div>

      {/* The arc of a day */}
      <ZigZag
        img="/images/site/lab-pool.jpg"
        alt="A warm, plant-filled movement studio inside the Frequency Lab"
        eyebrow="The experience"
        title="Arrive frazzled. Leave regulated."
        imgAspect="portrait"
        reverse
        tone="canvas"
      >
        <p>
          Step in off the street and the noise drops away. Move your body. Drop
          into your breath. Sweat in the sauna, then shock it all loose in the
          plunge. Land at the bar with a coffee and somebody you didn&apos;t
          know an hour ago.
        </p>
        <p>
          Nothing about it is accidental. Light, sound, temperature, and the
          people around you are all tuned to do one thing: bring you back to
          yourself.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Not a gym. Not a café. Not a studio.{' '}
        <span className="text-primary">All of it</span>, on purpose.
      </Statement>

      {/* Feature tiles with imagery */}
      <section className="bg-surface px-6 pb-20 sm:pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              Inside
            </p>
            <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
              What you&apos;ll find
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl overflow-hidden border border-border bg-surface hover:border-border-strong transition-colors"
              >
                <SiteImage
                  src={f.img}
                  alt={f.title}
                  aspect="16/10"
                  sizes="(min-width: 640px) 32rem, 100vw"
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

      {/* Designed to spread */}
      <ZigZag
        img="/images/site/lab-concept.jpg"
        alt="Concept render of a Frequency community space"
        eyebrow="The model"
        title="Designed to spread."
        tone="canvas"
      >
        <p>
          The first Lab is a prototype: a flagship rooted in one neighborhood,
          funded by the people it serves. It&apos;s built from day one to be
          repeatable, so the version that works here can open in your city next.
        </p>
        <p>
          The community always comes first. By the time a place is ready for a
          Lab, the people are already there. The Lab is simply where the
          community gets a body.
        </p>
      </ZigZag>

      <Statement tone="surface">
        The community comes first.{' '}
        <span className="text-primary">The Lab is where it gets a body.</span>
      </Statement>

      <BetaCTA
        heading="Be part of building it."
        body="The community is how the Lab begins. Join the Beta and help shape the first one."
      />
    </>
  )
}
