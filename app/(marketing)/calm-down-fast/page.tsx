// SEO pillar: how to calm down fast, "can't switch off," "tired but wired." The
// always-wired stress cluster (CONTENT-VOICE §7a.2). Pain-first, answer-first,
// relational register only (no medical claims, §8f).
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

const TITLE = 'How to calm down fast when you cannot switch off'
const DESCRIPTION =
  'Wired and tired at the same time? Here is a 60-second way to calm down fast, why you cannot switch off even when you are exhausted, and how to make calm your baseline instead of your best moments.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/breathwork-circle.jpg'
const PRACTICE_IMAGE = '/images/site/meditation-circle-outdoor.jpg'
const COMMUNITY_IMAGE = '/images/site/nature-viewing-sunset.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/calm-down-fast' },
    openGraph: {
      title: 'How to calm down fast when you cannot switch off · Frequency',
      description:
        'A 60-second way to calm down fast, why you stay wired even when you are exhausted, and how to make calm a habit instead of a rescue.',
      url: '/calm-down-fast',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'What is the fastest way to calm down?',
    a: 'Make your exhale longer than your inhale for about a minute. Breathe in for a count of four, out for a count of six, and do that six times. It is the fastest lever you have, and you can do it at a red light or before a hard conversation without anyone noticing.',
  },
  {
    q: 'Why can I not switch off even when I am exhausted?',
    a: 'Because tired and calm are two different states. Exhaustion is low fuel; wired is high alert, and you can be both at once. The alert keeps you from using the rest you badly need, so more rest alone does not break the loop. A clear "you are safe now" signal does, and a slow exhale is the most reliable one you can send on purpose.',
  },
  {
    q: 'What does "tired but wired" mean?',
    a: 'It means your body is running on high alert while your tank is empty. You are worn out and still cannot settle, like the engine is revving with the brake on. It is one of the most common complaints adults have, and it is not in your head.',
  },
  {
    q: 'Does slow breathing actually work or is it a placebo?',
    a: 'It genuinely changes how your body runs, not just how you feel about it. Slowing the exhale is one of the few calming switches you can reach on purpose. We keep the detail inside the practice pages and keep the surface simple: try it once and see if you feel steadier in a minute.',
  },
  {
    q: 'How do I stop feeling wired all the time?',
    a: 'Do one short calming practice at the same moment every day, before you need it, so your baseline drops instead of just your worst moments. The 60-second breath rescues a bad night; a small daily version is what slowly changes the rest of them.',
  },
  {
    q: 'Can being around other people help me calm down?',
    a: 'Yes. A lot of the always-on feeling eases when you are in the same calm room as other people on a regular rhythm, not just alone with your phone. A standing group that meets to breathe, walk, or sit gives your week a built-in moment to come down, with company.',
  },
]

export default function CalmDownFastPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/calm-down-fast',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, PRACTICE_IMAGE, COMMUNITY_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([{ name: 'Calm down fast', path: '/calm-down-fast' }]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group sitting in a circle outdoors, breathing together"
        focal="object-center"
        eyebrow="Always wired"
        title="How to calm down fast"
        subtitle="It is late, you are exhausted, and you still cannot switch off. Wired and tired at the same time is one of the most common complaints adults have. Here is the fastest way down, and how to make it stick."
      >
        <Button href="/discover/practices/pillar/body">
          See the calming practices <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To calm down fast, slow your exhale until it is longer than your breath
          in. That is the fastest lever you have, and it works in about a minute.
        </Lead>
        <Body>
          Breathe in through your nose for a count of four, then out slowly through
          your mouth for a count of six, and do that six times. A longer exhale
          tells your body it can ease off the gas. You might notice your shoulders
          drop by the third round. You might not. Either way you have done the
          thing, and the thing is what counts.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Relaxing is not a decision.{' '}
        <span className="text-primary">It is something you do with your body.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why am I always wired but tired?
        </h2>
        <Lead>
          Because the part of you that should stand down after a hard day never gets
          the signal. Being exhausted does not turn off being on alert.
        </Lead>
        <Body>
          Screens, news, and back-to-back demands keep you on low alert all day, so
          by night your body is still braced even though nothing is chasing you.
          That is why &quot;just relax&quot; never works. You cannot decide your way
          out of it.
          You can only send your body a clear, physical sign that the day is over,
          and a slow breath is the most reliable one there is.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={PRACTICE_IMAGE}
        alt="People sitting together on the grass with their eyes closed"
        eyebrow="What actually works"
        title="Small and repeated, not long and perfect."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The 60-second breath is for a crisis. The real win is making a short
          calming practice a habit, so your baseline comes down and you are not
          always rescuing yourself from the edge.
        </p>
        <p>
          The Body practices are the short, physical ones: a breath, cold water on
          your face, a two-minute walk, a reset you can do before your coffee. None
          of them ask for an hour, a mat, or a certain mood.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I make calm my baseline?
        </h2>
        <Lead>
          Do one small calming practice at the same moment every day, before you
          need it, not just when you are already over the edge. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Pick one anchor moment',
                body: 'The same spot every day. Before coffee, on the drive home, last thing before bed. Attach it to something you already do.',
              },
              {
                title: 'Keep it under five minutes',
                body: 'A minute of slow breathing counts. Short and done beats long and skipped. The point is the repeat, not the length.',
              },
              {
                title: 'Let the timer hold the space',
                body: 'When you want help, set a couple of minutes and let it count you down, so you are not also watching the clock.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to fix your whole nervous system today.{' '}
        <span className="text-primary">You have to take one slow breath.</span>
      </Statement>

      {/* One concept per section: the phone-as-cause reader. Cross-links the feed cluster. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if my phone is keeping me wired?
        </h2>
        <Lead>
          Then the breath will only get you so far, because the feed keeps topping
          the alert back up. The fix is a smaller, calmer evening, not more
          willpower at midnight.
        </Lead>
        <Body>
          If you scroll until your eyes hurt and then wonder why you cannot sleep,
          the phone is part of the loop. Calming down fast helps in the moment, and
          changing what your nights are made of helps for good. We wrote a whole
          piece on getting your evenings back from the feed, if that is the part
          that has its hooks in you.
        </Body>
        <div className="mt-8">
          <Button href="/loneliness" variant="secondary">
            Read: life after the feed
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a standing calm room. */}
      <ZigZag
        img={COMMUNITY_IMAGE}
        alt="A few people watching the sunset together from a quiet hillside"
        eyebrow="Where this lands"
        title="A standing time to come down, with company."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A lot of the always-on feeling eases when you are not alone with it. A
          Circle is a small local group that meets on a set rhythm, and plenty of
          them meet to breathe, walk, or sit together, so your week has a built-in
          moment to settle.
        </p>
        <p>
          You do not have to be good at meditating or even like the word. You pick a
          short practice, find a few people near you, and show up. The standing time
          does the slow work of turning calm from a rescue into a routine.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Try the 60-second breath right now, then pick one short practice to do at
          the same time tomorrow. When you want it to be a habit you keep, look at
          the Circles and events meeting near you and find a calm room to walk into.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover/practices/pillar/body">
            See the calming practices <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/discover" variant="secondary">
            See what&apos;s happening near you
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
        heading="Calm is a habit, not a lucky night."
        body="Frequency hands you short practices and a room that meets on a rhythm, so coming down stops being a rescue. Join the Beta and find your calm."
      />
    </>
  )
}
