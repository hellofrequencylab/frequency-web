// SEO pillar: how to find like-minded people, "where do I find people who get
// me," finding your people / your tribe as an adult. A distinct high-intent
// Seeker cluster (CONTENT-VOICE §7a) — the search is for belonging by shared
// wavelength, not just proximity. Answer-first, relational register only, no
// health claims.
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

const TITLE = 'How to find like-minded people'
const DESCRIPTION =
  'You are not looking for more people, you are looking for your people. Here is the honest way to find like-minded people: lead with what you actually care about, go where it is done in person, and let the shared thing do the sorting.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/group-of-friends.jpg'
const SHARED_IMAGE = '/images/site/song-circle.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/find-like-minded-people' },
    openGraph: {
      title: 'How to find like-minded people · Frequency',
      description:
        'You are not looking for more people, you are looking for your people. Lead with what you care about, go where it is done in person, and let the shared thing sort.',
      url: '/find-like-minded-people',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I find like-minded people?',
    a: 'Lead with the thing you actually care about and go where it is done in person on a schedule. Do not search for friends in the abstract. Pick one interest, value, or practice, find a small group built around it that meets regularly, and show up more than once. The shared thing does the sorting for you, so the people you keep meeting are already on your wavelength.',
  },
  {
    q: 'What does like-minded actually mean?',
    a: 'Like-minded is less about agreeing on everything and more about caring about the same things in the same way. It is the shared wavelength under the small talk: the same curiosity, the same values, the same thing you would happily spend a Saturday on. You can disagree about plenty and still be deeply like-minded, because what you have in common is what you point your attention at.',
  },
  {
    q: 'Where do I find people who share my interests?',
    a: 'Go to where the interest is practiced in person, not just discussed online. A standing class, a recurring group, a regular meetup around the thing itself puts you in a room of people who already chose it. Online you can find people who like the same thing; in a room that meets again, you find people who like it enough to keep showing up, and those are the ones worth knowing.',
  },
  {
    q: 'How do I find my tribe or my people as an adult?',
    a: 'Stop trying to find a whole tribe and find one small recurring room first. The phrase "my people" makes it sound like a crowd you discover all at once, but in practice it is built one repeated face at a time. Pick a thing you care about, become a regular where it happens, and let two or three real connections form. Your people are just enough of those, stacked up over months.',
  },
  {
    q: 'Why does it feel like nobody gets me?',
    a: 'Usually because the rooms you are in were not chosen around what you care about most. When the people around you came together by accident, work, proximity, circumstance, it is normal to feel slightly out of step, even with people you like. That feeling tends to lift fast once you put yourself in a room organized around the thing that actually lights you up, where being into it is the default rather than the odd one out.',
  },
  {
    q: 'Is it harder to find like-minded people in a small town?',
    a: 'It can feel that way, but the answer is the same: pick the recurring thing and become a regular. A smaller place has fewer rooms, so the ones that exist matter more and fill with the people who genuinely care. If the exact group you want does not exist yet, a small town is also the easiest place to start it, because the people quietly wanting the same thing are closer than they seem.',
  },
]

export default function FindLikeMindedPeoplePage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/find-like-minded-people',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, SHARED_IMAGE, TABLE_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Find like-minded people', path: '/find-like-minded-people' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of friends laughing together, clearly at ease with each other"
        focal="object-center"
        eyebrow="Looking for your people"
        title="How to find like-minded people"
        subtitle="You are surrounded by perfectly nice people and still feel a little out of step. You are not after more contacts. You are after the few who get it. Here is how to find them."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To find like-minded people, lead with the thing you actually care about
          and go where it is done in person, on a schedule. Do not look for friends
          in the abstract. Let the shared thing do the sorting.
        </Lead>
        <Body>
          The instinct is to look for people first and hope something clicks. The
          thing that actually works is the other way around: pick one interest,
          value, or practice, find a small group built around it that meets again,
          and show up. Everyone in the room already chose the same thing, so you
          start halfway to your people instead of from zero.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You are not looking for more people.{' '}
        <span className="text-primary">You are looking for your people.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What does like-minded actually mean?
        </h2>
        <Lead>
          Less about agreeing on everything, more about caring about the same things
          in the same way. It is the shared wavelength under the small talk.
        </Lead>
        <Body>
          You can disagree about plenty and still be deeply like-minded, because what
          you have in common is what you point your attention at: the same curiosity,
          the same values, the thing you would happily give up a Saturday for. That
          is why looking for people who simply agree with you is a dead end, and
          looking for people who care about the same thing is not. Shared attention,
          not shared opinions, is the glue.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={SHARED_IMAGE}
        alt="A group of people sitting in a circle singing together"
        eyebrow="What actually works"
        title="Lead with the thing, not the search."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The mistake is to go looking for like-minded people directly, as if they
          were the goal you walk in for. They are almost never found that way. They
          are found sideways, as the people who happen to be in the room you came to
          for the thing itself.
        </p>
        <p>
          So pick the interest, the practice, the cause you genuinely care about, and
          go to where it actually happens in person. A room organized around a shared
          thing has already done the hard filtering. The people who keep showing up
          for it are, almost by definition, your kind of people.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where do I actually go to find them?
        </h2>
        <Lead>
          Go where the thing you care about is practiced in person, on a repeating
          schedule, and become a regular there. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Name the one thing first',
                body: 'Pick a single interest, value, or practice you care about, not a vague wish to meet people. The narrower and more honest it is, the sharper the room it leads you to.',
              },
              {
                title: 'Find where it meets in person, again',
                body: 'Look for a standing class, circle, or group built around that thing. A recurring in-person room beats an online forum, because it gives you the same faces twice.',
              },
              {
                title: 'Show up enough to be recognized',
                body: 'Like-mindedness reveals itself over repeats, not in one night. Go back until people know your name. The connection forms in the second and third visit, not the first.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        Your people are not hiding.{' '}
        <span className="text-primary">They are just in a room you have not been to twice.</span>
      </Statement>

      {/* One concept per section: the "nobody gets me" reader, named plainly. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why does it feel like nobody gets me?
        </h2>
        <Lead>
          Usually because the rooms you are in were not chosen around what you care
          about most. Accidental rooms make even nice people feel slightly off-key.
        </Lead>
        <Body>
          When the people around you came together by work, proximity, or
          circumstance rather than by a shared thing, it is normal to feel a little
          out of step even with people you genuinely like. It is not a flaw in you or
          in them; it is just the wrong room for the part of you that wants company.
          That feeling tends to lift fast once you put yourself somewhere organized
          around the thing that lights you up, where being into it is the default
          instead of the odd one out.
        </Body>
        <div className="mt-8">
          <Button href="/loneliness" variant="secondary">
            Read: lonely even around people
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the shared-thing room. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        eyebrow="Where this lands"
        title="A room already sorted by what you care about."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group built around one shared thing, which is
          exactly the sorting you want done for you. Everyone in it chose the same
          topic, so the people you keep meeting are already pointed the same way you
          are.
        </p>
        <p>
          You pick the thing the Circle is about, find a few people near you who care
          about it too, and come back. We hand you the format and the rhythm, so a
          shared interest quietly turns into the few people who finally get it.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles and events meeting near you, sorted by topic, and pick
          the one closest to what you actually care about. Go twice. If the thing you
          want does not exist near you yet, that is not a dead end, it is the cue to
          start the small room you wish you could walk into.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find your people near you <ArrowRight className="h-5 w-5" />
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
        heading="Your people are out there, gathered around the thing you both care about."
        body="Frequency sorts local rooms by topic, so the faces you keep seeing are already on your wavelength. Join the Beta and find your people."
      />
    </>
  )
}
