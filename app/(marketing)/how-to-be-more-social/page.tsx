// SEO PILLAR (social confidence): the authoritative page for how to be more
// social, feeling less awkward in groups, and building a social life without
// drinking. This page ABSORBS two retiring guides (feel-less-awkward-in-groups,
// social-life-without-drinking), which 301 into it, so their coverage, examples,
// and target keywords are lifted here as full sections. A distinct high-intent
// Seeker cluster (CONTENT-VOICE §7a): the gap between wanting connection and the
// daily default of staying in, the fear of walking into a room, and the wish for
// a social life that does not run through a bar. Answer-first, relational
// register only, no health claims, no personality-fixing promises.
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
import { articleSchema, faqSchema, howToSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to be more social'
const DESCRIPTION =
  'How to be more social when you keep staying home: pick one recurring thing, put it on the calendar, and go back until the room knows your name.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). All verified present in public/images/site. Fed
// into the Article schema below so answer engines see dated, illustrated content.
const HERO_IMAGE = '/images/site/outdoor-group.jpg'
const RHYTHM_IMAGE = '/images/site/community-1.jpg'
const AWKWARD_IMAGE = '/images/site/song-circle.jpg'
const SOBER_IMAGE = '/images/site/group-singing.jpg'
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

// The three visible how-to steps, mirrored into HowTo schema (CONTENT-VOICE §8b):
// AI Overviews lift step-by-step guides, so the on-page Steps and the structured
// data are built from one source and can never drift.
const HOW_TO_STEPS = [
  {
    name: 'Choose one standing thing',
    text: 'Pick a single recurring group, class, or meetup built around something you would show up for anyway. One is enough. A vague plan to be more social goes nowhere; a Tuesday class does not.',
  },
  {
    name: 'Put it on the calendar and protect it',
    text: 'Block the time like a real appointment, before the tired version of you gets a vote. The decision should already be made by the time 6pm rolls around.',
  },
  {
    name: 'Go three times before you judge it',
    text: 'The first visit is always a little awkward. By the third, faces are familiar and the room feels like yours. Most of being social is just outlasting the first two visits.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Merged from this pillar and
// the two absorbed guides so the ranking equity for "feel less awkward in groups"
// and "social life without drinking" transfers here. Fed into the FAQPage schema
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
    q: 'How do I feel less awkward in groups?',
    a: 'Go back to the same small group more than once and let the activity carry the talking. Awkward is mostly the feeling of being unfamiliar, and familiarity is the only real cure. Pick one group built around an activity, show up twice, and let the second visit feel different on its own. You cannot talk yourself out of feeling awkward, but you can lower the stakes of any single night.',
  },
  {
    q: 'Why do I feel so awkward around new people?',
    a: 'Because your body reads a room of strangers as something to brace against, not relax into, and that bracing is what reads as awkward. It is not a flaw in your personality; it is what almost everyone feels the first time they walk in anywhere. The feeling fades as the faces stop being strange, which only happens with repeats.',
  },
  {
    q: 'What do I do with my hands and eyes when I feel awkward?',
    a: 'Give them a job. Hold a cup, help set up chairs, watch whoever is talking instead of scanning the room. Most awkwardness comes from having nothing to do with your attention, so an activity that occupies your hands quietly fixes your face too. This is the whole case for choosing a group built around a thing to do rather than a room where talking is the only event.',
  },
  {
    q: 'Is it better to go to events alone or bring a friend?',
    a: 'Going alone to a recurring group is what actually makes you a regular, even though bringing a friend feels safer. A friend is a comfortable place to hide, and you end up talking only to them. If you do bring someone, agree to split up for a while so the new room actually gets a chance.',
  },
  {
    q: 'How do I have a social life without drinking?',
    a: 'Build it around an activity instead of around alcohol, and pick groups that meet on a schedule. When the point of the gathering is the thing you came to do, a class, a walk, a circle, a shared meal, drinking stops being the centre of gravity and nobody is really tracking who has a glass and who does not. Choose recurring rooms over one-off nights out, show up more than once, and the social life builds itself without the bar.',
  },
  {
    q: 'How do I meet people without going to bars?',
    a: 'Go where people gather around a shared activity in daylight and on a repeat schedule. A standing class, a morning run group, a community dinner, a circle built around an interest all put you in a room of people who came for the thing, not the drinks. Bars are easy to default to because they are open and obvious, but a recurring activity gives you the same faces twice, which is what actually turns strangers into friends.',
  },
  {
    q: 'How do I tell friends I am not drinking without it being awkward?',
    a: 'Keep it short, light, and about you, then change the subject to what you are doing instead. A plain "not tonight, I am driving" or "I am off it for a bit, what are we getting into" is usually all anyone needs, and most people care less than you fear. The awkwardness fades fastest in settings that were never about drinking in the first place, which is the real fix: choose the gatherings where it simply never comes up.',
  },
  {
    q: 'Where do sober-curious people actually meet friends?',
    a: 'In recurring, activity-first rooms, the same places anyone meets lasting friends, just without the bar at the centre. Think standing interest groups, movement and wellbeing circles, daytime meetups, community meals, and creative sessions that gather the same people week after week. You are not looking for a special sober scene so much as ordinary gatherings organized around a shared thing, where whether or not you drink is beside the point.',
  },
  {
    q: 'What should I do if I am out of practice socially?',
    a: 'Start with one low-stakes recurring room and let your social muscle warm up over weeks, not in one night. If it has been a while, the rust is normal and it fades fast with reps. Do not throw yourself at a huge party to prove something. Go to the same small group a few times in a row, where nobody expects a performance and familiarity builds on its own. Being out of practice is temporary; the only cure is gentle, repeated showing up.',
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
            updated: '2026-07-24',
            image: [HERO_IMAGE, RHYTHM_IMAGE, AWKWARD_IMAGE, SOBER_IMAGE, ROOM_IMAGE],
          }),
          howToSchema({
            name: 'How to be more social',
            description:
              'Become more social by making showing up a habit instead of a nightly decision: pick one recurring thing, protect the time, and go back until the room is familiar.',
            image: [HERO_IMAGE],
            steps: HOW_TO_STEPS,
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
          rest. This page covers the whole social-confidence problem: getting out
          of the house at all, feeling less awkward once you are in the room, and
          building a real social life that does not run through a bar.
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

      {/* Answer-first how-to, then the concrete steps. Mirrored into HowTo schema. */}
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
            steps={HOW_TO_STEPS.map((s) => ({ title: s.name, body: s.text }))}
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
      </Section>

      {/* ABSORBED PILLAR 1: feel-less-awkward-in-groups. Answer-first H2, then the
          mechanism as an illustrated beat, then the concrete tactics (hands/eyes,
          alone vs a friend). Relational register, no medical claims. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I feel less awkward in groups?
        </h2>
        <Lead>
          Go back to the same small group more than once and let the activity carry
          the talking. Awkward is mostly the feeling of being new, and the only real
          cure for new is a second visit.
        </Lead>
        <Body>
          You cannot talk yourself out of feeling awkward, the same way you cannot
          decide to relax. When everyone is unfamiliar, you stay slightly on guard
          without meaning to, and that low hum of alert is what makes your sentences
          come out stiff. It is not a personality defect and it is not rare. It is
          the standard human response to a room you have never been in, and it
          quiets down the moment the faces stop being strange. The lever is picking
          a setting you return to, so no single night has to go well.
        </Body>
      </Section>

      <ZigZag
        img={AWKWARD_IMAGE}
        alt="People sitting in a circle singing together, at ease"
        eyebrow="What actually works"
        title="Let the activity do the talking."
        imgAspect="landscape"
        reverse
        tone="surface"
      >
        <p>
          The advice to &quot;just be confident&quot; is useless, because confidence
          is the result, not the lever. The lever is picking a setting with a
          built-in thing to do, so there is always an answer to &quot;what now,&quot;
          and it is never &quot;make small talk with a stranger.&quot;
        </p>
        <p>
          A walk, a class, a song circle, a shared table: each one hands you
          something to look at and do with your hands, so the conversation happens
          sideways, off the back of the activity, instead of head-on. Give your
          hands a job, hold a cup, help set up chairs, watch whoever is talking
          instead of scanning the room, and most of the awkwardness quietly goes
          with them.
        </p>
      </ZigZag>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Should I go alone or bring a friend?
        </h2>
        <Lead>
          Go alone to a recurring group. Bringing a friend feels safer, but a friend
          is a comfortable place to hide, and you end up talking only to them.
        </Lead>
        <Body>
          Going alone is what actually makes you a regular, because it puts you in
          the room with the people who are already there. Let the first visit be
          quiet. You do not have to perform or win the room; showing up and watching
          counts, and a low-key first time just buys you an easier second one. The
          first time is awkward for everyone, so it tells you almost nothing. Come
          back before you decide anything. If you do bring someone, agree to split
          up for a while so the new room actually gets a chance.
        </Body>
      </Section>

      <Statement tone="surface">
        You do not have to be the most comfortable person in the room.{' '}
        <span className="text-primary">You have to walk in twice.</span>
      </Statement>

      {/* ABSORBED PILLAR 2: social-life-without-drinking. Answer-first H2, the
          mechanism as an illustrated beat, then the tactics (meeting without bars,
          telling friends). No health or recovery framing: where you gather, not
          how you drink. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I build a social life without drinking?
        </h2>
        <Lead>
          Build it around an activity instead of around alcohol, and pick groups
          that meet on a schedule. When the point of the night is the thing you came
          to do, drinking stops being the centre of gravity.
        </Lead>
        <Body>
          The trap is thinking the choice is between drinking and staying home. It
          is not. Drinking became the easy shorthand for being social, the
          lowest-effort way to put bodies in a room together, but it is a thin kind
          of together: a night can feel close without much actually being shared,
          and the closeness is gone by morning. The fix is to change where you
          gather, not to white-knuckle the same bar with a soda water. Go where
          people meet around a shared activity in daylight and on a repeat schedule,
          a standing class, a morning run group, a community dinner, a circle built
          around an interest, and you are in a room of people who came for the thing,
          not the drinks. That is also the honest answer to how you meet people
          without going to bars.
        </Body>
      </Section>

      <ZigZag
        img={SOBER_IMAGE}
        alt="A group of people gathered together singing, lit up and laughing, no drinks in sight"
        eyebrow="Where sober-curious people actually meet friends"
        title="Gather around the thing, not the drink."
        imgAspect="landscape"
        reverse
        tone="surface"
      >
        <p>
          In a room built around an activity, nobody is counting who has a drink and
          who does not, because that was never what the room was for. You are bonding
          over something real, and that is the kind of common ground a friendship can
          actually stand on. It is arguably easier to make friends this way, because
          the connection starts on the thing you both care about instead of on a buzz
          that evaporates by the next morning.
        </p>
        <p>
          When someone asks why you are not drinking, keep it short and light, then
          point at what you are doing instead. A plain &quot;not tonight&quot; is
          usually all anyone needs, and in a room that was never about drinking, the
          question simply never comes up.
        </p>
      </ZigZag>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={ROOM_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        eyebrow="Where this lands"
        title="One standing room, already on the calendar."
        imgAspect="landscape"
        tone="canvas"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group that meets on a rhythm, built around one
          shared thing, which is exactly the fixed room this whole page points to.
          You are not signing up to be outgoing, or to work a crowd, or to drink.
          You are signing up to be somewhere, on a day, with the same few people
          each time.
        </p>
        <p>
          You pick the topic, find a few people near you who care about it too, and
          come back. We hand you the format and the rhythm, so the hardest part,
          leaving the house on a schedule, is already decided for you. It is free to
          join and free to show up.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors, plus the sibling pillars so the
          cluster cross-links (hub-and-spoke). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles and events meeting near you, pick the one you would
          genuinely show up for, drink or no drink, and put the next three dates in
          your calendar right now. If the thing you want to do does not exist near
          you yet, that is not a dead end, it is the cue to start the small standing
          room you wish you could walk into. Joining costs nothing, and Frequency
          never takes a cut of your own bookings, so you can{' '}
          <a href="/pricing" className="text-primary underline underline-offset-4">
            see exactly how the pricing works
          </a>{' '}
          before you commit to anything.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find something near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/how-to-start-a-circle" variant="secondary">
            Or start the room yourself
          </Button>
        </div>
        <p className="mt-8 text-muted">
          Keep going:{' '}
          <a href="/friendship-as-an-adult" className="text-primary underline underline-offset-4">
            how to make friends as an adult
          </a>
          ,{' '}
          <a href="/friendship-as-an-adult" className="text-primary underline underline-offset-4">
            how to meet people in a new city
          </a>
          , and{' '}
          <a href="/loneliness" className="text-primary underline underline-offset-4">
            feeling lonely but not alone
          </a>
          .
        </p>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="A fuller social life is mostly one thing on the calendar, kept."
        body="Frequency gives you small local rooms that meet on a rhythm, so showing up stops being a nightly decision and new stops being scary. Join the Beta and pick your standing thing."
      />
    </>
  )
}
