import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  PageHero,
  Section,
  Lead,
  Body,
  Steps,
  PullQuote,
  Statement,
  ZigZag,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import {
  articleSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

const PATH = '/how-to-build-community'
const TITLE = 'How to build community (and keep it going)'
const DESCRIPTION =
  'How to build community: pick one thing, set a standing time and place, keep it small, and meet again. The full builder guide to starting a group, hosting a recurring gathering, and running a community space.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: {
      title: 'How to build community · Frequency',
      description:
        'You do not have to build a whole community. Host one small group, on a regular rhythm, with a format that already works. The builder guide, start to lasting.',
      url: PATH,
      images: [{ url: '/images/site/community-1.jpg' }],
    },
  }
}

// The core plan, emitted as HowTo schema so answer engines can lift it step by
// step. Plain steps; the magic lives in the structure, not adjectives.
const STEPS = [
  {
    title: 'Pick one thing',
    body: 'Choose a single shared interest: a walk, a book, a meal, a sit. Narrow beats broad. People join a thing, not a vague idea of community.',
  },
  {
    title: 'Set a time and place',
    body: 'Same day, same spot, on a repeat. A standing rhythm is what lets a stranger become a regular. One-off events do not compound; a weekly slot does.',
  },
  {
    title: 'Keep it small',
    body: 'Five to ten people is plenty. Small groups feel safe and let everyone actually talk. You can always grow later; you cannot un-overwhelm a first night.',
  },
  {
    title: 'Meet again',
    body: 'The whole game is the second meeting, and the fifth. Familiarity does the work. Protect the rhythm even when it is small, and it will fill in over time.',
  },
] as const

// The recurrence-logistics track, absorbed from the retired "host a recurring
// gathering" guide. Cadence, fixed slot, run-of-show, reminders, shared load,
// protected ritual. Kept in one place so the on-page Steps and the HowTo schema
// never drift.
const RECURRING_STEPS = [
  {
    title: 'Pick a cadence you can actually keep',
    body: 'Weekly, every other week, or monthly, and be honest about which one you can hold for a year. A slower cadence you keep beats a fast one you drop. A gathering only becomes recurring once you have repeated the same slot enough times that people expect it.',
  },
  {
    title: 'Lock the same time and the same spot',
    body: 'Same day, same hour, same place, every time. A fixed slot lets people build a habit around it, and a fixed spot means nobody has to ask where. Moving the time to suit everyone is the fastest way to lose the regulars who had it penciled in.',
  },
  {
    title: 'Write a simple run-of-show',
    body: 'Sketch the shape of the night: how it opens, the main thing you do, how it closes. One page, reused every time. A light script means you are not reinventing the event on the day, and it lets a helper run it when you cannot make it.',
  },
  {
    title: 'Send the reminder every single time',
    body: 'A recurring gathering lives or dies on the reminder. Send the same short note before every meeting: when, where, and what to bring. Do not assume people remember. The reminder is not nagging, it is the thing that turns an intention into a turnout.',
  },
  {
    title: 'Share the load before you burn out',
    body: 'Hand off pieces early: someone sets up, someone greets newcomers, someone brings the coffee. A gathering that rides entirely on the host ends the first month the host is tired. Shared roles are what let a recurring event outlast any one person.',
  },
  {
    title: 'Protect the ritual, change the details',
    body: 'Keep the anchor, the time, the opening, the core thing, exactly the same, and let everything else flex. People come back for the parts that stay familiar. Change too much and it feels like a new event each time; keep the ritual and small tweaks keep it fresh.',
  },
] as const

// The operator-playbook track, absorbed from the retired "how to run a community
// space" guide. Rhythm, room, core, roles, light format, light tooling.
const SPACE_STEPS = [
  {
    title: 'Set one standing rhythm',
    body: 'Pick a day and time and repeat it without asking. The same Tuesday, weekly or every other week. A community space lives or dies on whether the rhythm holds, because people can only build a habit around a time that does not move.',
  },
  {
    title: 'Lock a room you can actually get',
    body: 'Find one spot you can reliably use on that rhythm: a park, a hall, a back corner, a living room. It does not need to be yours or impressive. It needs to be the same place enough weeks in a row that people stop asking where.',
  },
  {
    title: 'Grow a core of regulars',
    body: 'Aim for a handful who come back, not a crowd who came once. Three or four reliable regulars are the spine of a community space. Learn their names, notice when they miss, and let the room grow from the people who keep returning.',
  },
  {
    title: 'Hand out real roles',
    body: 'The moment you have a core, share the load. Someone brings the coffee, someone opens up, someone messages newcomers. A space that rides on one person ends the first hard month. Roles turn a room you run into a room a group holds.',
  },
  {
    title: 'Keep the format light and repeatable',
    body: 'Open the same way, do the thing, close the same way. A simple, repeatable shape lets people relax into the room instead of guessing what happens next, and it means you are not reinventing the night every time.',
  },
  {
    title: 'Use light tooling so it does not ride on you',
    body: 'Put the rhythm somewhere people can find it, send the reminder every time, and keep a simple record of who comes. A little tooling carries the admin that otherwise eats the host, so your energy goes to the room, not the logistics.',
  },
] as const

const FAQ = [
  {
    q: 'How do I build community from scratch?',
    a: 'Pick one shared interest, set a standing time and place, keep the first group small, and commit to meeting again. You do not need a venue, a budget, or a big audience. You need one thing, a repeating rhythm, and the willingness to host the same small group more than once. Community is just a small group that keeps meeting until the people in it would notice if it stopped.',
  },
  {
    q: 'How do I start a community group?',
    a: 'Start with one small Circle, not a whole community. Pick something you already care about, name a standing day and place, and invite a few people near you. You do not need a plan for everything. You need one regular night and a format you can run without inventing it. Frequency hands you that format, the first-night script, and a person to call.',
  },
  {
    q: 'How many people do I need to start?',
    a: 'You can start with three or four. Small is a feature, not a failure: a handful of people who keep coming back beats a big launch that never meets again. A small room that fills feels warm; a big one that half-empties feels like a flop even when good people came. Protect the rhythm at small numbers and the group fills in over time.',
  },
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
    q: 'What does it take to run a community space?',
    a: 'Four plain things: a standing rhythm, a room you can reliably get, a few regulars who come back, and light tooling so the admin does not fall on one person. None of them is charisma or a big budget. A community space is held together by consistency and a simple format, not by a magnetic host or a fancy venue.',
  },
  {
    q: 'Do I need a venue, a building, or a budget?',
    a: 'No. A living room, a park, a hall, a cafe corner, or a video call all work. Most community spaces run in a room someone borrows. What makes it a community space is the standing rhythm and the regulars, not the lease. Start with a time and a spot you can get every week, and worry about walls much later, if ever.',
  },
  {
    q: 'What tools do I need to keep a group going?',
    a: 'Enough to hold the rhythm without it living in your head: a place people can see when you meet, a reminder that goes out every time, a way to message the group, and a simple record of who comes. Frequency bundles these into a Space so you are not stitching together four apps to run one room.',
  },
  {
    q: 'What if I host something and nobody comes back?',
    a: 'That usually means the format had no rhythm, not that you failed. People come back to a standing plan, not a one-off. Set the same day and place every week, keep it simple, and invite the people who showed up to the next one before they leave. Small, quiet nights are normal early; cancelling teaches people the event is not reliable, so hold it anyway.',
  },
  {
    q: 'Do I have to do this alone?',
    a: 'No. On Frequency you host one Circle on a path that goes Member, Crew, Host, Guide, Mentor, and every rung has the one above it for backup. You hold the room; a Guide looks after the Hosts nearby. You bring the people and the willingness to show up, and the structure carries the rest.',
  },
  {
    q: 'How do I keep a community group going long-term?',
    a: 'Keep the rhythm steady and the format light, and do not carry it alone. Hand out small roles, let the regulars help, and lean on a structure that already works instead of reinventing the night every time. Groups die from chaos and burnout, not from low numbers.',
  },
  {
    q: 'What does Frequency cost to build community here?',
    a: 'You keep 100% of your own bookings, always. Frequency is a Community Collective, so we earn only on the business the network brings you, and that network rate shrinks as the community grows. See the plans on the pricing page. Month to month, take your data and leave anytime.',
  },
]

export default function HowToBuildCommunityPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: PATH,
            published: '2026-06-24',
            updated: '2026-07-24',
            image: [
              '/images/site/community-1.jpg',
              '/images/site/community-dinner.jpg',
              '/images/site/mens-group.jpg',
            ],
          }),
          howToSchema({
            name: 'How to start a community group',
            description:
              'A simple, repeatable way to start and sustain a small community group.',
            steps: STEPS.map((s) => ({
              name: s.title,
              text: s.body,
              url: `${SITE_URL}${PATH}`,
            })),
          }),
          howToSchema({
            name: 'How to host a recurring gathering',
            description:
              'The logistics of recurrence: cadence, a fixed time and spot, a run-of-show, reminders, shared roles, and a protected ritual.',
            image: '/images/site/community-dinner.jpg',
            steps: RECURRING_STEPS.map((s) => ({
              name: s.title,
              text: s.body,
              url: `${SITE_URL}${PATH}`,
            })),
          }),
          howToSchema({
            name: 'How to run a community space',
            description:
              'The operator playbook: a standing rhythm, a room you can get, a core of regulars, real roles, a light format, and light tooling.',
            image: '/images/site/mens-group.jpg',
            steps: SPACE_STEPS.map((s) => ({
              name: s.title,
              text: s.body,
              url: `${SITE_URL}${PATH}`,
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to build community', path: PATH },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Build"
        title="How to build community (and keep it going)"
        subtitle="You do not have to build a whole community. You have to host one small group, on a regular rhythm, and keep showing up. Here is the short version, plus the rails so you are never out front alone."
      />

      {/* Answer-first opening. Fully resolves "how to build community" up front. */}
      <Section tone="canvas" pad="pt-4 pb-16 sm:pt-6 sm:pb-20">
        <Lead>
          To build community: pick one thing, set a standing time and place, keep it
          small, and meet again. That is the whole recipe, and it works whether you
          have done this before or never tried.
        </Lead>
        <Body>
          The mistake almost everyone makes is starting too big: a grand vision, a
          packed launch, a name and a logo before the first hello. Skip all of it. A
          community is just a small group that meets again, then again, until the
          people in it would notice if it stopped. The rest of this page is the whole
          builder path: start the group, host it on a rhythm, and run the room so it
          outlasts your worst week.
        </Body>
      </Section>

      {/* Imagery: a real neighborhood gathering, not a crowd. */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A small neighborhood gathering of people sitting together outdoors"
        eyebrow="What this looks like"
        title="It starts smaller than you think."
        kicker="A few neighbors and a standing time, not a movement and a logo."
        imgAspect="landscape"
        imgPosition="center"
        tone="surface"
      >
        <p>
          This is a few neighbors who picked one night and kept it. No big launch, no
          audience, no plan for everything. One person set the day, held the door open
          more than once, and the rest filled in over time.
        </p>
        <p>
          That is the whole shape of it, and you can do the same this week. You bring
          the people and the willingness to show up. We hand you a format you can run
          without inventing it. See how it fits together on{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/the-community">
            the community
          </a>
          .
        </p>
      </ZigZag>

      {/* The core plan, as numbered steps (mirrors the first HowTo schema). */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I start a community group?
        </h2>
        <Lead>
          Pick one thing, set a time and place, keep it small, and meet again. Four
          plain steps, and you can take the first one this week.
        </Lead>
        <div className="mt-8">
          <Steps steps={STEPS} />
        </div>
      </Section>

      {/* Imagery: a real gathering, not a crowd. The builder is the reader. */}
      <ZigZag
        img="/images/site/group-of-friends.jpg"
        alt="A few friends hanging out together under a shade tent on a sunny afternoon"
        eyebrow="A Circle, up close"
        title="A few people, a standing time, a spot they can find."
        kicker="No stage, no guru out front. Just regulars who keep coming back."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="surface"
      >
        <p>
          These are friends, not a following. One of them picked a thing, named a
          time, and kept showing up for it, and the people who cared about the same
          thing showed up too. That is the whole move.
        </p>
        <p>
          You do not have to be the loudest person in the room or the one with all the
          answers. You have to be the reason there is a room. The format and the
          first-night plan come from us, so you are running a clear night instead of
          inventing one. Browse what people are running on{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/discover">
            discover
          </a>
          .
        </p>
      </ZigZag>

      <PullQuote tone="surface">
        You do not have to build a community.{' '}
        <span className="text-primary">Host one small group, more than once.</span>
      </PullQuote>

      {/* Absorbed track 1: recurrence logistics (from host-a-recurring-gathering). */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I host a recurring gathering?
        </h2>
        <Lead>
          Pick a cadence you can keep, lock the same time and spot, write a simple
          run-of-show, and send a reminder before every meeting. It is a logistics
          job, not a charisma job.
        </Lead>
        <Body>
          The magic people chase is not what makes an event recur. The boring parts
          are: a time that never moves, a place people can count on, a format you can
          repeat without thinking, and a reminder that goes out every single time. Get
          those humming and the gathering keeps happening whether or not any one night
          is special. Here are the six steps that turn a one-off into a standing
          gathering.
        </Body>
        <div className="mt-8">
          <Steps steps={RECURRING_STEPS} />
        </div>
      </Section>

      {/* The reminder + ritual beat, with a real gathering photo (lifted). */}
      <ZigZag
        img="/images/site/community-dinner.jpg"
        alt="Friends gathered around a long table at night under string lights"
        eyebrow="What makes it recur"
        title="Protect the ritual, flex the details."
        kicker="People come back to a plan that is easy to keep and hard to forget."
        imgAspect="landscape"
        imgPosition="center"
        tone="surface"
      >
        <p>
          A moving time and a missing reminder are the two quiet killers of
          attendance. Nobody decides to stop coming; they just lose track, and the gap
          between meetings does the rest. Fix the slot so it lives in their week, and
          send the same short note before each one: when, where, and what to bring.
          That is not nagging. It is the thing that turns an intention into a turnout.
        </p>
        <p>
          The anchor of a recurring gathering is the part that never changes: the
          time, the opening, the one thing you always do. Guard it, and let the details
          move around it. A Circle on Frequency runs the same shape every week and
          Dispatch sends the reminder for you, so the recurrence stops living in your
          head.
        </p>
      </ZigZag>

      <Statement tone="canvas">
        The quiet nights are not the failure.{' '}
        <span className="text-primary">Cancelling is.</span>
      </Statement>

      {/* Absorbed track 2: the operator playbook (from how-to-run-a-community-space). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I run a community space?
        </h2>
        <Lead>
          Running a community space takes four plain things: a standing rhythm, a room
          you can reliably get, a few regulars who come back, and light tooling so the
          admin does not all fall on you.
        </Lead>
        <Body>
          Notice what is not on that list. No magnetic personality, no lease, no launch
          event. The rooms that last are held together by consistency and a simple
          format, and both of those are things you can set up on purpose. Run yours as
          a{' '}
          <Link className="text-primary-strong font-semibold hover:underline" href="/spaces">
            Space
          </Link>{' '}
          and the front door, the format, and the reminders come built in. Here is the
          playbook, step by step.
        </Body>
        <div className="mt-8">
          <Steps steps={SPACE_STEPS} />
        </div>
      </Section>

      {/* The core of regulars, with a real gathering photo (lifted). */}
      <ZigZag
        img="/images/site/mens-group.jpg"
        alt="A small group of men sitting in a circle outdoors, talking"
        eyebrow="What actually holds it"
        title="A few regulars beat a big crowd."
        kicker="The spine is the three or four who come back whether it rains or not."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="canvas"
      >
        <p>
          The spine of a community space is not the turnout on the good night. It is
          the three or four people who come back every time. Learn their names, notice
          when they miss, and treat them like the co-owners they are becoming.
        </p>
        <p>
          Once you have that core, hand out roles. Someone brings the coffee, someone
          opens up, someone welcomes the newcomers. A room one person runs is fragile.
          A room a small group holds is hard to kill.
        </p>
      </ZigZag>

      {/* One concept per section: why groups fizzle. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do most groups fizzle out?
        </h2>
        <Lead>
          Because they lean on charisma and energy instead of structure. The host
          burns out, the rhythm slips, and the group quietly stops.
        </Lead>
        <Body>
          Groups do not usually die from low numbers. They die from chaos and burnout:
          a night that has to be reinvented every time, one person carrying all of it,
          no clear next date. The fix is boring and reliable: a format that repeats,
          small roles spread around, and a standing slot on the calendar that nobody
          has to decide on again.
        </Body>
      </Section>

      {/* The rails: a real Circle photo, the "we hand you the format" beat. */}
      <ZigZag
        img="/images/site/adult-play.jpg"
        alt="A small group on an oceanfront deck, one person upside down in a handstand while the others cheer"
        eyebrow="The rails"
        title="What do I do if I have never run a group before?"
        kicker="You set out the chairs. The format does the rest."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="canvas"
        cta={{ label: 'Or start a Circle with the format built in', href: '/how-to-start-a-circle' }}
      >
        <p>
          You do not start from a blank page. A Circle on Frequency comes with the
          rails: a format, a first-night script, a standing rhythm, and backup when you
          need it. The Circle runs the same shape every week, so the host is never
          improvising the night.
        </p>
        <p>
          You do not need to be a natural leader. You need to set out the chairs and be
          the reason your people have somewhere to go. When you want the tooling that
          carries the admin, the{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/tools-for-community-builders">
            community builder toolkit
          </a>{' '}
          is the whole kit in one place.
        </p>
      </ZigZag>

      {/* The ladder. Leaderful, not leader-dependent. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Do I have to do this alone?
        </h2>
        <Lead>
          No, and you should not. You step up exactly as far as you want, and every
          rung has the one above it for backup.
        </Lead>
        <Body>
          The path goes Member, then Crew, then Host, then Guide, then Mentor. You show
          up to a Circle as a Member. You learn the format as Crew. You hold one Circle
          as a Host, with the script and the backup handed to you. A Guide looks after
          the Hosts nearby, so nobody runs a room alone, and a Mentor keeps the Guides
          steady across a whole local community. Take whichever rung feels right, and
          step back any time.
        </Body>
        <Body>
          That is the point of the structure: it is leaderful, not leader-dependent.
          Take any one person out and it keeps running, because the people and the
          rhythm were the thing all along. Frequency is a Community Collective, built
          to support every community effort and help everyone in it succeed together,
          so the rails are shared, not something you assemble alone.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Groups do not die from low numbers.{' '}
        <span className="text-primary">They die from chaos and burnout.</span>
      </PullQuote>

      {/* Builder CTA into the product (Build pillar). Pricing intent handled honestly. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where do I start?
        </h2>
        <Body>
          Pick what you practice, find a few people near you, and hold the door open
          for one Circle. Frequency hands community builders the format, the
          first-night script, and the rails, so hosting is a clear next step instead of
          a blank page. You keep 100% of your own bookings, always. See exactly what a
          plan costs on the{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/pricing">
            pricing page
          </a>
          , month to month, leave anytime.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/the-community">
            Host your first Circle <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/spaces" variant="secondary">
            Run a group you already gather
          </Button>
        </div>
      </Section>

      {/* FAQ. Mirrors the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="Be the reason your people have somewhere to go."
        body="We hand you the format and the script, so you are never building it alone. Join the Beta and start one Circle."
      />
    </>
  )
}
