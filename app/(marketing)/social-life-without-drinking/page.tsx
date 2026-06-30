// SEO pillar: how to have a social life without drinking, "fun without alcohol,"
// sober-curious socializing, "how to meet people without going to bars." A
// distinct high-intent Seeker cluster (CONTENT-VOICE §7a) — the search is for
// belonging that does not run through the pub. Answer-first, relational register
// only, no health or recovery claims. We never frame this as treatment; it is
// about where you gather, not how you drink.
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

const TITLE = 'How to have a social life without drinking'
const DESCRIPTION =
  'You want a real social life, just not one built around a bar. Here is the honest way to do it: gather around an activity instead of alcohol, pick rooms that meet in daylight and repeat, and let the shared thing carry the night so nobody is counting who is drinking.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). All verified present in public/images/site. Fed
// into the Article schema below so answer engines see dated, illustrated content.
const HERO_IMAGE = '/images/site/group-singing.jpg'
const ACTIVITY_IMAGE = '/images/site/breathwork-circle-friends.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/social-life-without-drinking' },
    openGraph: {
      title: 'How to have a social life without drinking · Frequency',
      description:
        'You want a real social life, just not one built around a bar. Gather around an activity instead of alcohol, pick rooms that repeat, and let the shared thing carry the night.',
      url: '/social-life-without-drinking',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health or recovery claims. Each
// answer fully resolves the question in its first sentence or two. Fed into the
// FAQPage schema below verbatim.
const FAQ = [
  {
    q: 'How do I have a social life without drinking?',
    a: 'Build it around an activity instead of around alcohol, and pick groups that meet on a schedule. When the point of the gathering is the thing you came to do, a class, a walk, a circle, a shared meal, drinking stops being the centre of gravity and nobody is really tracking who has a glass and who does not. Choose recurring rooms over one-off nights out, show up more than once, and the social life builds itself without the bar.',
  },
  {
    q: 'How do I meet people without going to bars?',
    a: 'Go where people gather around a shared activity in daylight and on a repeat schedule. A standing class, a morning run group, a community dinner, a circle built around an interest all put you in a room of people who came for the thing, not the drinks. Bars are easy to default to because they are open and obvious, but a recurring activity gives you the same faces twice, which is what actually turns strangers into friends.',
  },
  {
    q: 'Is it possible to make friends without alcohol?',
    a: 'Yes, and arguably it is easier, because the friendships start on something real instead of on a buzz. Alcohol can make a night feel close without much actually being shared, so the connection often evaporates by the next morning. When you meet people around an activity you both care about, you are bonding over the thing itself, and that is the kind of common ground a friendship can be built on and remembered.',
  },
  {
    q: 'What can I do socially instead of drinking?',
    a: 'Pick something that is enjoyable to do alongside other people and meets regularly: a movement class, a walking or running group, a creative circle, a sauna or cold-water group, a shared dinner, a singing or sound circle, a sport. The format matters more than the specific activity. You want something that puts you next to the same people on a rhythm, so the doing carries the social part and you are not left making small talk over a drink.',
  },
  {
    q: 'How do I tell friends I am not drinking without it being awkward?',
    a: 'Keep it short, light, and about you, then change the subject to what you are doing instead. A plain "not tonight, I am driving" or "I am off it for a bit, what are we getting into" is usually all anyone needs, and most people honestly do not care as much as you fear. The awkwardness fades fastest in settings that were never about drinking in the first place, which is the real fix: choose the gatherings where it simply never comes up.',
  },
  {
    q: 'Where do sober-curious people actually meet friends?',
    a: 'In recurring, activity-first rooms, the same places anyone meets lasting friends, just without the bar at the centre. Think standing interest groups, movement and wellbeing circles, daytime meetups, community meals, and creative sessions that gather the same people week after week. You are not looking for a special sober scene so much as ordinary gatherings organized around a shared thing, where whether or not you drink is simply beside the point.',
  },
]

export default function SocialLifeWithoutDrinkingPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/social-life-without-drinking',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, ACTIVITY_IMAGE, TABLE_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Social life without drinking', path: '/social-life-without-drinking' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of people gathered together singing, lit up and laughing, no drinks in sight"
        focal="object-center"
        eyebrow="A social life, minus the bar"
        title="How to have a social life without drinking"
        subtitle="You still want the nights out, the inside jokes, the people. You just do not want every single one of them to run through a bar. Here is how to build a real social life that was never about the drinking."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To have a social life without drinking, build it around an activity
          instead of around alcohol, and pick groups that meet on a schedule. When
          the point of the night is the thing you came to do, the drinking stops
          being the centre of gravity.
        </Lead>
        <Body>
          The trap is thinking the choice is between drinking and staying home. It
          is not. The fix is to change where you gather, not to white-knuckle the
          same bar with a soda water. Pick rooms organized around a shared thing, a
          class, a walk, a circle, a meal, and the social part takes care of itself
          while the question of who is drinking quietly disappears.
        </Body>
      </Section>

      <PullQuote tone="surface">
        The problem was never that you drink.{' '}
        <span className="text-primary">It is that everything social runs through a bar.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why does socializing always seem to mean drinking?
        </h2>
        <Lead>
          Because the bar is the default room, not because it is the best one. It is
          open, obvious, and asks nothing of you except to show up and order.
        </Lead>
        <Body>
          Drinking became the easy shorthand for being social, the lowest-effort way
          to put bodies in a room together. But it is a thin kind of together: a
          night can feel close without much actually being shared, and the closeness
          is gone by morning. Once you notice that the bar is just the path of least
          resistance, it gets a lot easier to choose a different room, one where the
          point is the thing you are all doing.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={ACTIVITY_IMAGE}
        alt="A circle of friends sitting close together on the floor, eyes shut, breathing together"
        eyebrow="What actually works"
        title="Gather around the thing, not the drink."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The move is to let an activity be the reason everyone is there. A class, a
          run, a circle, a shared meal, a sauna, a game gives the night its own
          centre, so being social is a side effect of doing the thing rather than a
          job you have to do over a glass.
        </p>
        <p>
          It also quietly solves the awkward part. In a room built around an
          activity, nobody is counting who has a drink and who does not, because that
          was never what the room was for. You are bonding over something real, and
          that is the kind of common ground a friendship can actually stand on.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          So what do I actually do instead?
        </h2>
        <Lead>
          Pick an activity-first room that meets on a repeat schedule, and become a
          regular there. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Pick the activity, not the venue',
                body: 'Choose a thing you would enjoy doing alongside other people: a movement class, a walk, a creative session, a shared dinner, a sport. Let the activity be the reason to show up, so drinking is never the point.',
              },
              {
                title: 'Find where it meets again, in daylight',
                body: 'Look for a standing group, circle, or class that gathers on a rhythm, ideally before the night-out hours. A recurring daytime room gives you the same faces twice without a bar anywhere near it.',
              },
              {
                title: 'Show up enough to be a regular',
                body: 'Friendship forms over repeats, not in one big night. Go back until people know your name. The connection builds on the second and third visit, around the thing you both keep coming for.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        A good night out does not need a bar.{' '}
        <span className="text-primary">It needs a reason and the same faces twice.</span>
      </Statement>

      {/* One concept per section: the social-awkwardness fear, named plainly. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I handle it when everyone else is drinking?
        </h2>
        <Lead>
          Keep it short and light, then point at what you are doing instead. Most
          people care far less than you fear, and in the right room it never comes up.
        </Lead>
        <Body>
          A plain &ldquo;not tonight&rdquo; is usually all anyone needs, and the
          subject moves on in seconds. The deeper fix, though, is not getting better
          at explaining yourself in bars, it is spending more of your social life in
          rooms that were never about drinking in the first place. Choose the
          gatherings organized around an activity, and the whole question quietly
          stops being a question.
        </Body>
        <div className="mt-8">
          <Button href="/feel-less-awkward-in-groups" variant="secondary">
            Read: feel less awkward in groups
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the activity-first room. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        eyebrow="Where this lands"
        title="A room built around the thing, not the bar tab."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group built around one shared thing, which is
          exactly the room you want: the activity is the point, the same people come
          back, and whether anyone is drinking is simply not what the night is about.
        </p>
        <p>
          You pick the thing the Circle gathers around, find a few people near you
          who care about it too, and keep showing up. We hand you the format and the
          rhythm, so a shared interest turns into a real social life that never
          needed the pub to hold it together.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles and events meeting near you, sorted by activity, and
          pick the one that sounds genuinely good to do, drink or no drink. Go
          twice. If the kind of room you want does not exist near you yet, that is
          not a dead end, it is the cue to start the gathering you wish you could
          walk into.
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
        heading="A real social life, built on something better than a bar tab."
        body="Frequency gathers local rooms around what people actually want to do, so the nights you remember were never about the drinking. Join the Beta and find yours."
      />
    </>
  )
}
