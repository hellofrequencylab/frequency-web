// SEO pillar (Labs track): "host a recurring gathering", "how to host a recurring
// event / regular meetup". The logistics/operator angle on recurrence. Answer-first,
// HowTo schema, a Steps block. Speaks to the Latent Leader / host running the
// mechanics (CONTENT-VOICE §2b). Distinct from /how-to-start-a-circle (the Community
// leader-activation page): this is the recurrence logistics, cross-linked not
// duplicated. Relational register, no health claims. Single-pillar Labs.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  Steps,
  PullQuote,
  ZigZag,
  Statement,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { howToSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to host a recurring gathering'
const DESCRIPTION =
  'A recurring gathering runs on logistics, not charisma: one standing time, a reliable spot, a simple run-of-show, and a reminder that goes out every single time. Here is how to host one that keeps happening.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the HowTo schema below.
const HERO_IMAGE = '/images/site/meditation-circle-outdoor.jpg'
const RHYTHM_IMAGE = '/images/site/community-dinner.jpg'
const RAILS_IMAGE = '/images/site/adult-play.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/host-a-recurring-gathering' },
    openGraph: {
      title: 'How to host a recurring gathering · Frequency',
      description:
        'The logistics of recurrence: one standing time, a reliable spot, a simple run-of-show, and a reminder every time. How to host a gathering that keeps happening.',
      url: '/host-a-recurring-gathering',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The ordered "how to" the HowTo schema is built from. Kept in one place so the
// on-page Steps and the structured data never drift apart. This is the logistics
// track: cadence, spot, run-of-show, reminders, shared load, protecting the ritual.
const HOW_TO_STEPS = [
  {
    name: 'Pick a cadence you can actually keep',
    text: 'Choose weekly, every other week, or monthly, and be honest about which one you can hold for a year. A slower cadence you keep beats a fast one you drop. The gathering only becomes recurring once you have repeated the same slot enough times that people expect it.',
  },
  {
    name: 'Lock the same time and the same spot',
    text: 'Same day, same hour, same place, every time. A fixed slot lets people build a habit around it, and a fixed spot means nobody has to ask where. Moving the time to suit everyone is the fastest way to lose the regulars who had it penciled in.',
  },
  {
    name: 'Write a simple run-of-show',
    text: 'Sketch the shape of the gathering: how it opens, the main thing you do, how it closes. One page, reused every time. A light script means you are not reinventing the event on the day, and it lets a helper run it when you cannot make it.',
  },
  {
    name: 'Send the reminder every single time',
    text: 'A recurring gathering lives or dies on the reminder. Send the same short note before every meeting: when, where, and what to bring. Do not assume people remember. The reminder is not nagging, it is the thing that turns an intention into a turnout.',
  },
  {
    name: 'Share the load before you burn out',
    text: 'Hand off pieces early: someone sets up, someone greets newcomers, someone brings the coffee. A gathering that rides entirely on the host ends the first month the host is tired. Shared roles are what let a recurring event outlast any one person.',
  },
  {
    name: 'Protect the ritual, change the details',
    text: 'Keep the anchor, the time, the opening, the core thing, exactly the same, and let everything else flex. People come back for the parts that stay familiar. Change too much and it feels like a new event each time; keep the ritual and small tweaks keep it fresh without losing the rhythm.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I host a recurring gathering?',
    a: 'Pick a cadence you can keep, lock the same time and spot, write a simple run-of-show, and send a reminder before every meeting. A recurring gathering is a logistics job, not a charisma job. Get the time fixed, the format repeatable, and the reminder automatic, and the event keeps happening whether or not any single night is magical.',
  },
  {
    q: 'How often should a recurring gathering meet?',
    a: 'Weekly or every other week keeps faces familiar; monthly works if that is the honest most you can hold. The right cadence is the fastest one you can actually keep for a year, not the one that sounds impressive. Consistency matters far more than frequency: a monthly gathering that never skips beats a weekly one that fizzles by spring.',
  },
  {
    q: 'How do I get people to come back every time?',
    a: 'Keep the time fixed and send the reminder every single time. People come back to a gathering that is easy to plan around and hard to forget. A moving time or a missing reminder quietly kills attendance, while a standing slot and a short heads-up before each meeting turn a one-time crowd into regulars.',
  },
  {
    q: 'What do I do when only a couple of people show up?',
    a: 'Hold the gathering anyway and treat the two who came like the point. Small nights are normal, especially early, and cancelling teaches people the event is not reliable. The regulars are built on the nights you showed up when it was quiet, so keep the time, run the format, and let word spread from the people who kept coming.',
  },
  {
    q: 'Where should a recurring gathering meet?',
    a: 'Somewhere you can reliably get on your cadence: a park, a hall, a cafe corner, a living room. The spot does not need to be yours or impressive, it needs to be the same place enough times that people stop asking where. Reliability beats the perfect venue, because the whole point of recurring is that nothing about the logistics is a surprise.',
  },
  {
    q: 'What is the difference between a recurring gathering and a Circle?',
    a: 'A recurring gathering is any event you hold on a repeating rhythm; a Circle is the ready-made Frequency format for one, with the rails already built in. This page is the general logistics of recurrence. If you want the ready-made format, the opening and closing, the first-night plan, and a path for your regulars, start a Circle instead of assembling it all by hand.',
  },
]

export default function HostARecurringGatheringPage() {
  return (
    <>
      <JsonLd
        data={[
          howToSchema({
            name: TITLE,
            description: DESCRIPTION,
            image: [HERO_IMAGE, RHYTHM_IMAGE, RAILS_IMAGE],
            steps: HOW_TO_STEPS.map((s) => ({
              name: s.name,
              text: s.text,
              url: '/host-a-recurring-gathering',
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to host a recurring gathering', path: '/host-a-recurring-gathering' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A circle of people gathered outdoors for a shared practice at golden hour"
        focal="object-center"
        eyebrow="The logistics of recurrence"
        title="How to host a recurring gathering"
        subtitle="One standing time, a reliable spot, a simple run-of-show, and a reminder that goes out every time. The mechanics of a gathering that keeps happening. Not the pep talk. The logistics."
      >
        <Button href="/spaces">
          Host it on a Space <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To host a recurring gathering, pick a cadence you can keep, lock the same
          time and spot, write a simple run-of-show, and send a reminder before every
          meeting. It is a logistics job, not a charisma job.
        </Lead>
        <Body>
          The magic people chase is not what makes an event recur. The boring parts
          are: a time that never moves, a place people can count on, a format you can
          repeat without thinking, and a reminder that goes out every single time.
          Get those humming and the gathering keeps happening whether or not any one
          night is special.
        </Body>
      </Section>

      <PullQuote tone="surface">
        A recurring gathering is not built on great nights.{' '}
        <span className="text-primary">It is built on a reminder that always goes out.</span>
      </PullQuote>

      {/* One concept per section: the reminder, named plainly, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I get people to come back every time?
        </h2>
        <Lead>
          Keep the time fixed and send the reminder every single time. People return
          to a gathering that is easy to plan around and hard to forget.
        </Lead>
        <Body>
          A moving time and a missing reminder are the two quiet killers of
          attendance. Nobody decides to stop coming; they just lose track, and the
          gap between meetings does the rest. Fix the slot so it lives in their week,
          and send the same short note before each one: when, where, and what to
          bring. That is not nagging. It is the thing that turns an intention into a
          turnout.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the rhythm, with a real gathering photo. */}
      <ZigZag
        img={RHYTHM_IMAGE}
        alt="Friends gathered around a long table at night under string lights"
        eyebrow="What makes it recur"
        title="Protect the ritual, flex the details."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The anchor of a recurring gathering is the part that never changes: the
          time, the opening, the one thing you always do. People come back for the
          familiar, so guard it. When the core stays put, everyone can relax into the
          room instead of relearning it every time.
        </p>
        <p>
          Around that anchor, let the details move. A different topic, a new face
          leading, a change of snack. Keep the ritual and small tweaks keep it fresh;
          change too much and it feels like a brand new event nobody has a habit
          around yet.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps (mirrored into HowTo schema). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What are the steps to host a recurring gathering?
        </h2>
        <Lead>
          Pick a cadence, lock the time and spot, write a run-of-show, send the
          reminder every time, share the load, and protect the ritual. Six plain
          steps:
        </Lead>
        <div className="mt-8">
          <Steps steps={HOW_TO_STEPS.map((s) => ({ title: s.name, body: s.text }))} />
        </div>
      </Section>

      <Statement tone="canvas">
        The quiet nights are not the failure.{' '}
        <span className="text-primary">Cancelling is.</span>
      </Statement>

      {/* Cross-link to the Circle activation page (distinct: the ready-made format). */}
      <ZigZag
        img={RAILS_IMAGE}
        alt="A group of adults playing together outdoors, laughing in the open air"
        eyebrow="How Frequency helps"
        title="The reminders and the format, handled."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'Or start a Circle with the format built in', href: '/how-to-start-a-circle' }}
      >
        <p>
          Host your recurring gathering on a Space and the logistics stop living in
          your head. Dispatch sends the reminder before every meeting, the standing
          time and spot sit on one page people can find, and a simple record shows
          who keeps coming, so you can host without chasing everyone by hand.
        </p>
        <p>
          If you would rather not assemble the run-of-show yourself, a Circle hands
          you the ready-made format, the opening and closing, a first-night plan, and
          a path for your regulars to step up. Same recurring room, with the rails
          already built.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: host it, or start a Circle. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          The fastest way to host a recurring gathering is on a Space: set your
          cadence, let Dispatch carry the reminders, and hold your first one this
          week. If you want the ready-made format instead of building the run-of-show
          by hand, start a Circle. Both keep the same faces coming back.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/spaces">
            Host it on a Space <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/how-to-start-a-circle" variant="secondary">
            Start a Circle instead
          </Button>
        </div>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="The gathering that keeps happening runs on rails, not luck."
        body="Frequency carries the reminders, the format, and the rhythm so your recurring gathering does not ride on you alone. Join the Beta and host your Space."
      />
    </>
  )
}
