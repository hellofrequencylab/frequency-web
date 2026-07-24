// SEO PILLAR (Seeker track, CONTENT-VOICE §7a): the making-friends hub. Absorbs
// the retired thin guides (meet-people-new-city, find-like-minded-people,
// how-to-reconnect-with-old-friends) so all their ranking equity and coverage
// consolidate here: how to make friends as an adult, why it is hard after 30,
// meeting people in a new city, finding like-minded people, and reconnecting with
// old friends. Pain-first, answer-first, relational register only, no health
// claims. This page is a HUB: it links forward to /discover and the sibling
// pillars, and hands off to the leader track for the reader who wants to start
// the room themselves.
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

const TITLE = 'How to make friends as an adult'
// Meta description carries the primary keyword and stays under ~155 chars.
const DESCRIPTION =
  'How to make friends as an adult: the built-in ways to meet people vanish after 30. Pick one thing that meets on a rhythm, and go back more than once.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e): images of real Frequency gatherings. Fed into the
// Article schema below so answer engines see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg'
const PLAY_IMAGE = '/images/site/PHOTO-2020-10-07-14-38-02.jpeg'
const HOOP_IMAGE = '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg'
const SHARED_IMAGE = '/images/site/song-circle.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'
const CITY_IMAGE = '/images/site/outdoor-group.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/friendship-as-an-adult' },
    openGraph: {
      title: 'How to make friends as an adult · Frequency',
      description:
        'Why friendship gets harder after 30, plus how to meet people in a new city, find like-minded people, and reconnect with old friends. One repeatable move: the same room, more than once.',
      url: '/friendship-as-an-adult',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The ordered "how to reconnect with an old friend" steps, absorbed from the
// retired /how-to-reconnect-with-old-friends guide. Kept in one place so the
// on-page Steps and the HowTo structured data never drift apart.
const RECONNECT_STEPS = [
  {
    name: 'Drop the guilt first',
    text: 'Most friendships do not end in a fight. They drift because life got loud. Whoever reaches out is not the one who failed, they are the one being brave. Let go of the story that too much time has passed to be allowed to text. It has not.',
  },
  {
    name: 'Send one short, warm message',
    text: 'Keep it light and specific. Name a real memory or something that reminded you of them. "Walked past our old coffee spot and thought of you. How are you?" beats a long apology. You are opening a door, not writing an essay.',
  },
  {
    name: 'Do not over-explain the silence',
    text: 'Resist the urge to account for every month you were quiet. A breezy "I am bad at this and I have missed you" lands warmer than a guilt-soaked timeline. The gap matters far less to them than the fact that you reached out at all.',
  },
  {
    name: 'Offer one easy, concrete plan',
    text: 'A vague "we should catch up" dies in two busy lives. Offer something small and real: a walk Saturday, a coffee next week, a call on Sunday. One specific, low-pressure invitation is what turns a nice message into an actual reunion.',
  },
  {
    name: 'Pick up where you both are now',
    text: 'You are both different people. Do not try to resurrect the exact old friendship. Be curious about who they have become, share who you are now, and let a current version of the friendship grow from the first hangout.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim. Consolidated from all four merged guides so this hub answers the
// whole making-friends cluster in one place.
const FAQ = [
  {
    q: 'How do you make friends as an adult?',
    a: 'You make friends as an adult by showing up to the same place on a regular rhythm and going back more than once. Adult friendships form from repeated, low-pressure run-ins with the same people, not from one great conversation. Pick something that meets on a schedule and keep coming back.',
  },
  {
    q: 'Why is it so hard to make friends after 30?',
    a: 'Because the built-in ways we used to meet people are gone. School, college, and early jobs handed you the same faces every day, so friendships formed without effort. After 30 you have to build that proximity on purpose, and most people never learned how.',
  },
  {
    q: 'How long does it take to make a real friend as an adult?',
    a: 'It usually takes many hours of shared time, spread over weeks, before an acquaintance becomes a friend. That is why one-off events rarely work and a standing weekly thing does. The repetition is the point, not the icebreakers.',
  },
  {
    q: 'Is it normal to have no close friends as an adult?',
    a: 'Yes, it is far more common than people admit. Plenty of capable, well-liked adults have a full contact list and no one to call on a Tuesday. It is not a character flaw; it is what happens when the easy ways to meet people disappear.',
  },
  {
    q: 'How do I make friends in a new city where I do not know anyone?',
    a: 'Pick one recurring thing near you and become a regular at it fast. A new city wipes years of small overlaps to zero on day one, so do not try to meet the whole city. Find one small group that meets on a schedule and show up twice before you decide anything about it.',
  },
  {
    q: 'What is the best way to meet people if I work from home?',
    a: 'Build the contact your commute and office used to provide. With no workplace handing you faces, a standing weekly group is not a nice-to-have, it is the main way you will meet anyone at all. Put one recurring thing in your week and protect it like a meeting.',
  },
  {
    q: 'How do I find like-minded people who actually get me?',
    a: 'Lead with the thing you care about and go where it is done in person on a schedule. Do not search for friends in the abstract. Pick one interest, value, or practice, find a small group built around it, and show up more than once. The shared thing does the sorting, so the people you keep meeting already care about what you care about.',
  },
  {
    q: 'Where do I find people who share my interests?',
    a: 'Go to where the interest is practiced in person, not just discussed online. A standing class, a recurring group, a regular meetup around the thing itself puts you in a room of people who already chose it. Online you find people who like the same thing; in a room that meets again, you find the ones who like it enough to keep showing up.',
  },
  {
    q: 'How do I reconnect with an old friend I have lost touch with?',
    a: 'Send one short, warm message that names a real memory, keep it light instead of apologetic, and offer one easy, specific plan to actually see them. You do not need a reason or a perfect opening line. A simple "I was thinking about you, how are you?" reopens most doors.',
  },
  {
    q: 'Is it weird to message a friend I have not spoken to in years?',
    a: 'No. It feels weirder in your head than it lands in their inbox. Most people are quietly glad to hear from someone they drifted from, because they assumed the same friction you did. A short, friendly message about a shared memory reads as someone who still cares.',
  },
  {
    q: 'What if I am too shy or too busy to make friends?',
    a: 'You do not have to be outgoing, you have to be consistent. A group that meets on a set schedule does the hard part for you: you just attend. Shy people make great regulars, because being a familiar face matters more than being the life of the party.',
  },
]

export default function FriendshipPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/friendship-as-an-adult',
            published: '2026-06-24',
            updated: '2026-07-24',
            image: [HERO_IMAGE, PLAY_IMAGE, HOOP_IMAGE, SHARED_IMAGE, TABLE_IMAGE],
          }),
          // HowTo for the reconnect steps, built from the visible copy below so the
          // structured data matches the page (absorbed from the retired guide).
          howToSchema({
            name: 'How to reconnect with an old friend',
            description:
              'Reconnect with an old friend you drifted from: drop the guilt, send one short warm message, keep it light, and offer one easy plan to see them.',
            image: [TABLE_IMAGE, HERO_IMAGE],
            steps: RECONNECT_STEPS.map((s) => ({
              name: s.name,
              text: s.text,
              url: '/friendship-as-an-adult',
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Adult friendship', path: '/friendship-as-an-adult' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of friends gathered together on the beach"
        focal="object-center"
        eyebrow="Adult friendship"
        title="How to make friends as an adult"
        subtitle="You used to make friends without trying. Now it feels like a second job. Here is what changed, and the small, repeatable thing that actually works."
      >
        <Button href="/discover">
          Find a Circle near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          You make friends as an adult by going back to the same place, with the
          same people, more than once. That is the whole trick, and almost nobody
          says it out loud.
        </Lead>
        <Body>
          Friendship needs repeated, unplanned time with the same faces. School,
          college, and your first jobs handed you that for free, so friendships
          formed on their own. Take it away and nothing replaces it by default. The
          part nobody taught us is how to build that proximity on purpose. The good
          news: it is a skill, which means it is learnable, and it is simpler than
          it sounds. Whether you are starting over in a new city, hunting for people
          who get you, or trying to reach back to a friend you drifted from, the move
          underneath all three is the same one.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You did not get worse at friendship.{' '}
        <span className="text-primary">The easy ways to meet people disappeared.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why is it so hard to make friends after 30?
        </h2>
        <Lead>
          Because friendship used to be a side effect, and now it has to be a
          choice. Proximity used to be free; now you have to build it.
        </Lead>
        <Body>
          Every easy friendship you have ever made probably came from being stuck in
          the same place as someone, over and over: a hallway, a dorm, a first job.
          You did not network. You just kept running into the same people. By your
          thirties that constant exposure is gone, replaced by a calendar full of
          obligations and a commute that ends at your own front door. You move, you
          partner up, the old crew scatters, and your week fills with people you work
          with but would not call on a Saturday.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={PLAY_IMAGE}
        alt="Friends playing together on the beach"
        eyebrow="What actually builds it"
        title="Repetition, not chemistry."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The myth is that you make a friend in one magic conversation. The reality
          is that friendship is built from repetition: the same faces, the same
          room, enough times that small talk wears a groove into something real.
        </p>
        <p>
          A one-off mixer almost never produces a friend. A thing that meets every
          Thursday eventually does, almost without you noticing. The chemistry shows
          up after the reps, not before them.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps so the mechanism is actionable. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do adults actually make friends?
        </h2>
        <Lead>
          By showing up to the same place on a regular rhythm and going back more
          than once. That is the entire mechanism. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Pick one standing thing',
                body: 'A class, a court, a walk, a Circle. Anything that meets on a set schedule near you.',
              },
              {
                title: 'Go back more than once',
                body: 'The second visit is when a stranger starts to become a familiar face. The fifth is when a familiar face starts to become a friend.',
              },
              {
                title: 'Let the rhythm do the work',
                body: 'You do not have to be charming. You have to be the person who is reliably there.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        The secret is not better small talk.{' '}
        <span className="text-primary">It is the same room, more than once.</span>
      </Statement>

      {/* Absorbed from /find-like-minded-people: the reader who wants their people,
          not just more people. Answer-first, one concept per section. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I find like-minded people, not just more people?
        </h2>
        <Lead>
          Lead with the thing you actually care about and go where it is done in
          person, on a schedule. Do not look for friends in the abstract. Let the
          shared thing do the sorting.
        </Lead>
        <Body>
          Like-minded is less about agreeing on everything and more about caring
          about the same things in the same way. You can disagree about plenty and
          still be deeply like-minded, because what you have in common is what you
          point your attention at. So pick one interest, value, or practice, find a
          small group built around it that meets again, and show up. Everyone in that
          room already chose the same thing, so you start halfway to your people
          instead of from zero.
        </Body>
      </Section>

      {/* Illustrated beat for the like-minded mechanism, real gathering photo. */}
      <ZigZag
        img={SHARED_IMAGE}
        alt="A group of people sitting in a circle singing together"
        eyebrow="What actually works"
        title="Lead with the thing, not the search."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          The mistake is to go looking for like-minded people directly, as if they
          were the goal you walk in for. They are almost never found that way. They
          are found sideways, as the people who happen to be in the room you came to
          for the thing itself.
        </p>
        <p>
          A room organized around a shared thing has already done the hard filtering.
          The people who keep showing up for it are, almost by definition, your kind
          of people. If it feels like nobody gets you, it is usually because the
          rooms you are in were chosen by accident, not around what you care about
          most.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Your people are not hiding.{' '}
        <span className="text-primary">They are in a room you have not been to twice.</span>
      </Statement>

      {/* Absorbed from /meet-people-new-city: the reader starting over somewhere new. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I moved here and do not know anyone?
        </h2>
        <Lead>
          Pick one recurring thing near your new place and become a regular at it
          fast. A new city has plenty of one-off events; what you need is the same
          room more than once.
        </Lead>
        <Body>
          A move wipes years of small overlaps to zero on day one. Back home you had
          the same gym, the same neighbors, the same faces at the same places, and
          friendships formed off all that accidental repetition. It is not that the
          people in your new city are colder. You just have not been in the same room
          as anyone here twice yet. The instinct is to say yes to everything and meet
          as many people as possible. The thing that actually works is smaller and
          more boring: pick one standing time and become a regular, not a tourist.
        </Body>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Choose recurring over one-off',
                body: 'A weekly thing near you beats a big one-time mixer. You are buying repeats, and only a standing schedule sells them.',
              },
              {
                title: 'Show up twice before you judge it',
                body: 'The first time anywhere new is awkward for everyone. The second time is when faces start to feel familiar. Most people quit after one and conclude the city is cold.',
              },
              {
                title: 'Let the activity carry you in',
                body: 'Go for the walk, the class, the table, not to make friends. Walking in for a thing to do is easy. The friends arrive quietly behind it.',
              },
            ]}
          />
        </div>
      </Section>

      {/* Illustrated beat for the new-city / work-from-home reader. */}
      <ZigZag
        img={CITY_IMAGE}
        alt="A group of people gathered together outside on a sunny day"
        eyebrow="If you work from home"
        title="Build the contact your commute used to hand you."
        imgAspect="landscape"
        tone="surface"
      >
        <p>
          When there is no office and no shared hallway, nobody is handing you faces
          on repeat. So a standing weekly group is not a nice-to-have, it is the main
          way you will meet anyone at all. Put one recurring thing in your week and
          protect it like a meeting.
        </p>
        <p>
          It does not have to be big. One small group, same time each week, is enough
          to turn a city full of strangers into a few people who know your name. This
          is the same engine that makes friendship work at any age, just run in a
          place where you are starting from scratch.
        </p>
      </ZigZag>

      {/* Absorbed from /how-to-reconnect-with-old-friends: the drifted-friend reader,
          with the ordered steps mirrored into the HowTo schema above. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I reconnect with old friends who drifted?
        </h2>
        <Lead>
          Send one short, warm message that names a real memory, keep it light
          instead of apologetic, and offer one easy plan to actually see them. You
          did not fall out. You just stopped sending the text.
        </Lead>
        <Body>
          The thing that keeps most people stuck is not the friend, it is the story
          that too much time has passed to be allowed to reach out. It has not. The
          person on the other end almost certainly misses the same easy thing you do,
          and is waiting for someone to be the first to reach back. Be that someone,
          keep it small, and let the rest follow. Here is the whole move, in five
          plain steps:
        </Body>
        <div className="mt-8">
          <Steps steps={RECONNECT_STEPS.map((s) => ({ title: s.name, body: s.text }))} />
        </div>
      </Section>

      <Statement tone="surface">
        You do not have to explain the silence.{' '}
        <span className="text-primary">You have to send one warm line.</span>
      </Statement>

      {/* One concept per section: the "too shy or too busy" reader. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I am too shy or too busy?
        </h2>
        <Lead>
          Then a standing schedule is your friend. You do not need to be charming;
          you need to keep turning up.
        </Lead>
        <Body>
          Shy people make excellent regulars. When a group meets on a set rhythm, the
          pressure to perform drops away, because nobody is trying to win the room in
          one night. You just become the person who is always there, and being
          reliably present is what turns a stranger into a familiar face and a
          familiar face into a friend. Busy is the same problem: one recurring slot
          beats ten good intentions you never act on.
        </Body>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={HOOP_IMAGE}
        alt="People hooping together next to a palm tree"
        eyebrow="Where this lands"
        title="A standing room with the same faces."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small group around something you care about that meets on a
          set rhythm, so the same handful of people keep ending up in the same room.
          That is the repetition that makes friends, built in on purpose, and it is
          exactly the sorting a new city or a random social calendar never does for
          you.
        </p>
        <p>
          A Channel is what the Circle is about: one of the seven topics, from
          movement to creative to human relating. You pick what you practice, and
          the standing time does the slow work of turning a room of strangers into
          your people. Reach out to an old friend, then bring them into a room that
          meets again, so a friendship never has to rebuild from zero a second time.
        </p>
      </ZigZag>

      {/* Soft CTA into the product + hub links to the sibling pillars. Frequency is
          free to join; pricing intent is low here, so the pricing link is a light
          aside rather than a push. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          You can browse the Circles and events already happening near you and find a
          room to walk into, or read how the whole thing fits together first. Either
          way, the move is the same: pick one standing time and go back more than
          once. Frequency is a Community Collective built to help every local group
          get going, so if the room you want does not exist near you yet, that is the
          cue to start it.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/the-community" variant="secondary">
            See how the community works
          </Button>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button href="/loneliness" variant="secondary">
            Read: lonely but not alone
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

      <Statement tone="canvas">
        Get people together.
        <br />
        Do things <span className="text-primary">on purpose.</span>
      </Statement>

      <BetaCTA
        heading="Friendship is just a standing plan you keep."
        body="Frequency hands you a room that meets on a rhythm, so the same people keep showing up. Join the Beta and find yours."
      />
    </>
  )
}
