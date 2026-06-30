// SEO pillar: how to feel less awkward in groups, "social anxiety meeting new
// people," "scared to walk into a room of strangers." The social-anxiety cluster
// (CONTENT-VOICE §7a.6). Pain-first, answer-first, relational register only (no
// medical claims, §8f).
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

const TITLE = 'How to feel less awkward in groups'
const DESCRIPTION =
  'Dread walking into a room of people you do not know? Here is how to feel less awkward in groups: go back to the same small one, let the activity carry the talking, and let familiarity do what willpower cannot.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/mens-group.jpg'
const REGULAR_IMAGE = '/images/site/song-circle.jpg'
const COMMUNITY_IMAGE = '/images/site/community-1.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/feel-less-awkward-in-groups' },
    openGraph: {
      title: 'How to feel less awkward in groups · Frequency',
      description:
        'Dread a room full of strangers? Feel less awkward in groups by returning to the same small one and letting the activity, not small talk, carry you in.',
      url: '/feel-less-awkward-in-groups',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I feel less awkward in groups?',
    a: 'Go back to the same small group more than once instead of facing a new room every time. Awkward is mostly the feeling of being unfamiliar, and familiarity is the only real cure. Pick one group built around an activity, show up twice, and let the second visit feel different on its own.',
  },
  {
    q: 'Why do I feel so awkward around new people?',
    a: 'Because your body reads a room of strangers as something to brace against, not relax into, and that bracing is what reads as awkward. It is not a flaw in your personality; it is what almost everyone feels the first time they walk in anywhere. The feeling fades as the faces stop being strange, which only happens with repeats.',
  },
  {
    q: 'How can I be less awkward if I have social anxiety?',
    a: 'Lower the stakes of any single moment by choosing settings you return to, so no one night has to go well. A standing group means a quiet first visit costs you nothing, because you get a calmer second one. Pick something with a built-in activity so there is always something to do besides make conversation.',
  },
  {
    q: 'What do I do with my hands and eyes when I feel awkward?',
    a: 'Give them a job. Hold a cup, help set up chairs, watch whoever is talking instead of scanning the room. Most awkwardness comes from having nothing to do with your attention, so an activity that occupies your hands quietly fixes your face too.',
  },
  {
    q: 'Is it better to go to events alone or bring a friend?',
    a: 'Going alone to a recurring group is what actually makes you a regular, even though bringing a friend feels safer. A friend is a comfortable place to hide, and you end up talking only to them. If you do bring someone, agree to split up for a while so the new room actually gets a chance.',
  },
  {
    q: 'Will I always feel this awkward, or does it get easier?',
    a: 'It gets easier, and faster than it feels like it will. The awkwardness is tied to newness, not to you, so it drains away as a place stops being new. People who keep returning to one small group are usually surprised how ordinary it feels within a month.',
  },
]

export default function FeelLessAwkwardInGroupsPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/feel-less-awkward-in-groups',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, REGULAR_IMAGE, COMMUNITY_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Feel less awkward in groups', path: '/feel-less-awkward-in-groups' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group of people sitting together and talking, relaxed"
        focal="object-center"
        eyebrow="Walking in"
        title="How to feel less awkward in groups"
        subtitle="You stand outside the door, hand on the handle, sure that everyone inside already knows each other and you will have nothing to say. Almost everyone feels this. Here is the way through it."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To feel less awkward in groups, go back to the same small one more than
          once. Awkward is mostly unfamiliarity, and the only real cure for that is
          a second visit.
        </Lead>
        <Body>
          You cannot talk yourself out of feeling awkward, the same way you cannot
          decide to relax. What you can do is pick one small group that meets again,
          walk in for the thing it does, and let the room get familiar. The first
          time anywhere is stiff for everyone. The second time is when your
          shoulders come down a little, all on their own.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Awkward is not who you are.{' '}
        <span className="text-primary">It is just the feeling of being new.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do I feel so awkward around new people?
        </h2>
        <Lead>
          Because your body reads a room of strangers as something to brace for, and
          that bracing is exactly what shows up as awkward. It is not a flaw in you.
        </Lead>
        <Body>
          When everyone is unfamiliar, you stay slightly on guard without meaning
          to, scanning for where you fit and what you are supposed to say. That low
          hum of alert is what makes your hands feel wrong and your sentences come
          out stiff. It is not a personality defect and it is not rare. It is the
          standard human response to a room you have never been in, and it quiets
          down the moment the faces stop being strange.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={REGULAR_IMAGE}
        alt="People sitting in a circle singing together, at ease"
        eyebrow="What actually works"
        title="Let the activity do the talking."
        imgAspect="landscape"
        tone="canvas"
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
          sideways, off the back of the activity, instead of head-on. That is far
          easier than a room where talking is the only event.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I actually walk into the room?
        </h2>
        <Lead>
          Pick one recurring group built around an activity, lower the stakes of the
          first visit, and plan to come back before you judge it. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Choose an activity, not a mixer',
                body: 'A group that does a thing beats a room where talking is the whole event. The activity gives your hands a job and your nerves somewhere to go.',
              },
              {
                title: 'Let the first time be quiet',
                body: 'You do not have to perform or win the room. Showing up and watching counts. A standing group means a low-key first visit just buys you an easier second one.',
              },
              {
                title: 'Come back before you decide',
                body: 'The first time is awkward for everyone, so it tells you almost nothing. The second time is when faces turn familiar. Most people quit after one and blame themselves.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to be the most comfortable person in the room.{' '}
        <span className="text-primary">You have to walk in twice.</span>
      </Statement>

      {/* One concept per section: the loneliness-underneath reader. Cross-links the cluster. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if the awkwardness is keeping me alone?
        </h2>
        <Lead>
          Then the fix is not getting smoother at parties, it is finding one small
          room you can return to until it stops being scary. The goal is a few
          familiar faces, not a crowd you charm.
        </Lead>
        <Body>
          A lot of people read their own awkwardness as proof they are not built for
          this, and slowly stop going out at all. But the same thing that makes a
          new room hard, having no repeats yet, is the exact thing that fixes it
          once you build a few. You do not need to become a different person. You
          need one standing group where the faces are already known.
        </Body>
        <div className="mt-8">
          <Button href="/loneliness" variant="secondary">
            Read: lonely but not alone
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={COMMUNITY_IMAGE}
        alt="A relaxed group of friends gathered together, talking and laughing"
        eyebrow="Where this lands"
        title="A small room with the same faces."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group on a standing schedule, which is the one
          thing a room full of strangers can never be: familiar by the second visit.
          The same handful of people keep ending up together, on purpose, around
          something they actually want to do.
        </p>
        <p>
          You pick what the Circle is about, find a few people near you, and come
          back. The format and the rhythm do the heavy lifting, so the awkward part
          shrinks each week until it is just a room you know.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Pick one Circle or event near you that meets again, choose it for the
          activity, and go twice before you decide anything. If the awkwardness has
          quietly grown into feeling alone, it helps to know that is common and that
          it eases once you have a standing room to return to.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/friendship-as-an-adult" variant="secondary">
            How to make friends as an adult
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
        heading="Awkward fades the second time you walk in."
        body="Frequency hands you a small room near you that meets on a rhythm, so the same faces keep showing up and new stops being scary. Join the Beta and find your people."
      />
    </>
  )
}
