import type { Metadata } from 'next'
import {
  ArrowRight,
  DoorOpen,
  Compass,
  CalendarDays,
  Users,
  HeartHandshake,
  LineChart,
} from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import {
  PhotoHero,
  Section,
  SectionHeading,
  ZigZag,
  Statement,
  BetaCTA,
  Button,
  Card,
  Lead,
  Body,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Spaces',
  description:
    'Run your community as a Space on Frequency. A front door in Discover, the tools to host Circles and Runs, and a model that holds the door open for everyone. Free to start, no card today.',
  alternates: { canonical: '/spaces' },
  openGraph: {
    title: 'Spaces · Frequency',
    description:
      'Bring your community onto Frequency as a Space: a real front door, the format for Circles and Runs, and tools to grow without losing what made it yours.',
    url: '/spaces',
  },
}

// getPublishedData -> getTemplate -> legacy, mirroring every other marketing route.
// The (marketing) layout supplies the header/footer chrome, so a Puck document drops
// straight in. The coded story below is the last-resort legacy fallback until a
// designed `spaces` template ships. One primary CTA: Join the Beta.
export default async function SpacesPage() {
  const published = await getPublishedData('spaces')
  const template = getTemplate('spaces')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Spaces', path: '/spaces' }])} />
      {data ? <Render config={config} data={data} /> : <LegacySpaces />}
    </>
  )
}

type IconType = React.ComponentType<{ className?: string }>

// What a Space gets — quick-scan grid. Honest at day zero: no counts, no claims of
// a thriving roster. Just the tools and the shape.
const INSIDE: { icon: IconType; title: string; body: string }[] = [
  {
    icon: DoorOpen,
    title: 'A real front door',
    body: 'Your Space gets a page in Discover, so the people looking for what you do can actually find you.',
  },
  {
    icon: Compass,
    title: 'Channels that connect',
    body: 'List what you practice as Channels, and the neighbors who care about the same thing land in your room.',
  },
  {
    icon: CalendarDays,
    title: 'Runs, not one-offs',
    body: 'Host Circles that walk a Journey together week after week. The format comes with it, so a group lasts past week three.',
  },
  {
    icon: Users,
    title: 'A path for your people',
    body: 'Member to Crew to Host to Guide to Mentor. Your regulars can step up, and nobody runs a room alone.',
  },
  {
    icon: HeartHandshake,
    title: 'A door held open',
    body: 'Pay-it-forward is built in. The people who can give more quietly cover the neighbors who cannot pay yet.',
  },
  {
    icon: LineChart,
    title: 'Tools to grow',
    body: 'A simple way to run the day to day, set the rhythm, and see your community take shape. Start free, grow when you are ready.',
  },
]

function LegacySpaces() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <PhotoHero
        image="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A small group gathered close together for a practice outdoors at golden hour"
        focal="object-center"
        eyebrow="Spaces"
        title="Run your community as a Space."
        subtitle="Already gather people for breathwork, strength, sound, or supper? Bring it onto Frequency. Get a front door, the format for Circles and Runs, and a model that keeps the door open to everyone."
      >
        <Button href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
        </Button>
      </PhotoHero>

      {/* ── The premise ────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="pt-20 pb-10 sm:pt-24 sm:pb-12">
        <SectionHeading
          eyebrow="Who this is for"
          title="The practitioners who already do the work."
          kicker="A teacher, a studio, a run club, a circle keeper. The people holding rooms open."
        />
        <Lead>
          You are already the reason a few people have somewhere to go. The hard part is
          the rest: a front door so new people find you, a format so a group lasts, and
          a way to grow without losing what made it yours.
        </Lead>
        <Body>
          A Space is your community on Frequency. Your Channels, your Circles, your Runs,
          inside a structure built to last and a network of neighbors looking for exactly
          what you do.
        </Body>
      </Section>

      <Statement tone="surface">
        Your community keeps its soul.{' '}
        <span className="text-primary">You just stop doing it alone.</span>
      </Statement>

      {/* ── What you get ───────────────────────────────────────────────────── */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="What a Space gets"
          title="Everything a room needs to last."
          kicker="The front door, the format, and the backup, in one place."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INSIDE.map((f) => (
            <Card
              key={f.title}
              tone="feature"
              className="hover:border-border-strong transition-colors"
            >
              <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </div>
              <h3 className="font-display uppercase text-text text-2xl leading-none">
                {f.title}
              </h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{f.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Bring it over ──────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A community gathered together outdoors, moving in golden-hour light"
        eyebrow="Bring it over"
        title="Your people, on a structure that holds."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Most communities run on one person&apos;s energy, and energy runs out. A Space
          gives yours a shape: Channels to find new people, Runs to keep the regulars
          coming back, and a path so your members can step up and share the load.
        </p>
        <p>
          You keep your voice and your practice. Frequency carries the format, the rails,
          and the backup, so the room can outlast any one tired evening.
        </p>
      </ZigZag>

      {/* ── The honest beat ────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A circle gathered on a cliffside at golden hour, instruments passed around"
        eyebrow="The honest part"
        title="We are early. That is the offer."
        imgAspect="landscape"
        reverse
        tone="ink"
      >
        <p>
          Spaces are just opening up, and the paid tools are still being built. We are not
          going to pretend otherwise. What is real today is the community, the format, and
          a front door you can claim now.
        </p>
        <p>
          Join the beta and you help shape what a Space becomes. The practitioners who
          come in first set the tone for everyone who follows.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Start free.{' '}
        <span className="text-primary">Grow when you are ready.</span>
      </Statement>

      {/* ── Close — the single CTA ─────────────────────────────────────────── */}
      <BetaCTA
        heading="Bring your community home."
        body="Claim your Space, host one Circle, and let the format carry the rest. No card today, leave anytime."
      />
    </>
  )
}
