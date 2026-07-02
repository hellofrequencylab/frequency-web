// SEO pillar: how to be more social, "I want to be more social but I always
// stay home," becoming more outgoing as an adult, being social when you are
// introverted or out of practice. A distinct high-intent Seeker cluster
// (CONTENT-VOICE §7a) — the gap is between wanting connection and the daily
// default of staying in. Answer-first, relational register only, no health
// claims, no personality-fixing promises.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  Steps,
  ZigZag,
  Statement,
  PullQuote,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to be more social'
const DESCRIPTION =
  'You want to be more social and somehow still end up home alone. The honest fix is not becoming a different, louder person. It is picking one recurring thing, putting it on the calendar, and showing up until the people there know your name.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/outdoor-group.jpg'
const RHYTHM_IMAGE = '/images/site/community-1.jpg'
const ROOM_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/how-to-be-more-social' },
    openGraph: {
      title: 'How to be more social · Frequency',
      description:
        'You want to be more social and still end up home alone. The fix is not a new personality. Pick one recurring thing, put it on the calendar, and become a regular.',
      url: '/how-to-be-more-social',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I become more social?',
    a: 'Pick one recurring thing you would genuinely show up for and put it on your calendar before you can talk yourself out of it. Being social is not a personality you switch on, it is a habit of being in the same room more than once. Choose a standing class, group, or meetup, commit to going three times, and let repetition do the work. The hard part is not the talking, it is leaving the house on a schedule.',
  },
  {
    q: 'Why do I want to be social but always stay home?',
    a: 'Because staying home is the easy default and being social asks for a decision every single time. Wanting connection and choosing the couch are not a contradiction, they are just two different moments: the wanting happens in the abstract, the choosing happens when you are tired at 6pm. The fix is to remove the nightly decision by committing to one thing on a fixed day, so showing up becomes the default instead of the exception.',
  },
  {
    q: 'How can I be more social as an introvert?',
    a: 'Build on structure and repetition instead of forcing yourself to be outgoing. Introverts do not need to become extroverts to have a full social life, they need rooms that do not depend on working a crowd. A small group built around a shared activity is ideal, because the thing itself carries the interaction, you see the same few faces each time, and you can leave when you are spent. Depth over volume is a feature, not a problem.',
  },
  {
    q: 'What should I do if I am out of practice socially?',
    a: 'Start with one low-stakes recurring room and let your social muscle warm up over weeks, not in one night. If it has been a while, the rust is normal and it fades fast with reps. Do not throw yourself at a huge party to prove something. Go to the same small group a few times in a row, where nobody expects a performance and familiarity builds on its own. Being out of practice is temporary; the only cure is gentle, repeated showing up.',
  },
  {
    q: 'How do I make plans actually happen instead of cancelling?',
    a: 'Tie the plan to a standing event with other people expecting you, not to a one-off you scheduled with yourself. Plans you make alone are the easiest to cancel because no one notices. A recurring group meets whether or not you feel like it, and once a few people there know your name, your absence is felt, which is exactly the gentle pressure that gets you out the door. Build the obligation into the structure instead of relying on willpower.',
  },
  {
    q: 'Is it too late to be more social as an adult?',
    a: 'No. Adults become more social all the time, and the method is the same at any age: find one recurring room and become a regular. It can feel like everyone else already has their people, but most adults are quietly hoping for exactly what you are. The rooms are there, organized around shared interests and practices, and they are open to the person who simply keeps coming back.',
  },
]

export default function HowToBeMoreSocialPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/how-to-be-more-social',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, RHYTHM_IMAGE, ROOM_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to be more social', path: '/how-to-be-more-social' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group of friends outdoors together, relaxed and mid-conversation"
        focal="object-center"
        eyebrow="Wanting to get out more"
        title="How to be more social"
        subtitle="You keep meaning to. Then it is 6pm, you are tired, and the couch wins again. You do not need a new personality. You need one thing on the calendar and a reason to keep going back."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To be more social, pick one recurring thing you would actually show up
          for, put it on the calendar, and go back until people there know your
          name. It is a habit, not a personality.
        </Lead>
        <Body>
          The trap is treating sociability as a trait you either have or you do
          not. In practice it is just the result of being in the same room more
          than once. You do not have to become louder, funnier, or more outgoing.
          You have to remove the nightly decision of whether to leave the house,
          by committing to one standing thing and letting repetition carry the
          rest.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Being social is not a personality.{' '}
        <span className="text-primary">It is a habit of showing up.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do I want to be social but always stay home?
        </h2>
        <Lead>
          Because staying home is the easy default and being social asks for a
          fresh decision every single time. The wanting and the choosing happen in
          different moments.
        </Lead>
        <Body>
          You feel the want in the abstract, on a Sunday, scrolling. You make the
          choice when you are tired at the end of a workday, and the couch always
          has the better pitch. It is not a willpower flaw and it is not proof you
          secretly prefer being alone. It is just that an open-ended evening will
          lose to the path of least resistance almost every time. The way out is
          to stop deciding nightly and decide once, by putting one thing on a
          fixed day.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={RHYTHM_IMAGE}
        alt="People gathered together outdoors at a community gathering, talking in small groups"
        eyebrow="What actually works"
        title="Beat the nightly decision with a fixed rhythm."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The single change that makes people more social is not confidence, it is
          a calendar. A recurring thing on a set day removes the part you keep
          losing: the choice. You are not deciding whether to go out tonight, you
          are just going to the thing you already do on Tuesdays.
        </p>
        <p>
          So pick one room that meets again. Not a vague intention to see people
          more, but a specific group, class, or gathering with a time attached.
          Once it is a standing fixture, showing up stops being an act of will and
          starts being a habit, which is the whole game.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I actually start?
        </h2>
        <Lead>
          Pick one recurring thing, commit to going three times, and treat it like
          an appointment you do not cancel. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Choose one standing thing',
                body: 'Pick a single recurring group, class, or meetup built around something you would show up for anyway. One is enough. A vague plan to be more social goes nowhere; a Tuesday class does not.',
              },
              {
                title: 'Put it on the calendar and protect it',
                body: 'Block the time like a real appointment, before the tired version of you gets a vote. The decision should already be made by the time 6pm rolls around.',
              },
              {
                title: 'Go three times before you judge it',
                body: 'The first visit is always a little awkward. By the third, faces are familiar and the room feels like yours. Most of being social is just outlasting the first two visits.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not need to be more outgoing.{' '}
        <span className="text-primary">You need to go back a third time.</span>
      </Statement>

      {/* One concept per section: the introvert reader, named plainly. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How can I be more social as an introvert?
        </h2>
        <Lead>
          Build on structure and small rooms instead of forcing yourself to work
          a crowd. You do not have to become an extrovert to have a full social
          life.
        </Lead>
        <Body>
          Introverts thrive in rooms where the activity does the talking, where the
          group is small enough to actually know, and where leaving early is fine.
          That is the opposite of a big loud party and far more sustainable. Pick a
          gathering built around a shared thing, see the same handful of faces each
          week, and let depth do what volume never could. Wanting fewer, closer
          connections is not a limitation to fix, it is a perfectly good way to be
          social.
        </Body>
        <div className="mt-8">
          <Button href="/feel-less-awkward-in-groups" variant="secondary">
            Read: feeling less awkward in groups
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={ROOM_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        eyebrow="Where this lands"
        title="One standing room, already on the calendar."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group that meets on a rhythm, which is exactly
          the fixed thing this whole page points to. You are not signing up to be
          outgoing. You are signing up to be somewhere, on a day, with the same few
          people each time.
        </p>
        <p>
          You pick the topic, find a few people near you who care about it too, and
          come back. We hand you the format and the rhythm, so the hardest part,
          leaving the house on a schedule, is already decided for you.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles and events meeting near you, pick the one you would
          genuinely show up for, and put the next three dates in your calendar
          right now. If the thing you want to do does not exist near you yet, that
          is not a dead end, it is the cue to start the small standing room you
          wish you could walk into.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find something near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/how-to-start-a-circle" variant="secondary">
            Or start the room yourself
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
        heading="A fuller social life is mostly one thing on the calendar, kept."
        body="Frequency gives you small local rooms that meet on a rhythm, so showing up stops being a nightly decision. Join the Beta and pick your standing thing."
      />
    </>
  )
}
