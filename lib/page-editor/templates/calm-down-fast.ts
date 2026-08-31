import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// CALM DOWN FAST — the FIFTH seeker article enrolled in the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). The always-wired stress cluster
// (CONTENT-VOICE §7a.2): how to calm down fast, "can't switch off," "tired but
// wired." Pain-first, answer-first, relational register only (no medical
// claims, §8f).
//
// This file is a SPEC, not a document. The document is assembled by
// `articleTemplate` (templates/article.ts), which owns the CONTENT-VOICE §10.9
// article grammar — question H2s, the direct answer first, one concept per
// section, an FAQ, and the schema each block carries. Nothing structural is
// decided here; only the words.
//
// EVERY STRING BELOW IS THE COPY THE CODED ROUTE SHIPPED, verbatim. The conversion
// moved words between renderers; it did not rewrite them. Block for block, in order:
//   PhotoHero        → Hero (image)              (hero + heroCta)
//   Lead + Body      → Text                      (answer + intro)
//   PullQuote        → Statement                 (openingBeat)
//   Section 1        → Heading + Text
//     ZigZag 1                    → MediaText                (beat)
//   Section 2        → Heading + Text
//     Steps (3, no schema)        → BuildTimeline            (steps)
//     Statement                   → Statement                (beat)
//   Section 3        → Heading + Text + Buttons  (the /loneliness cross-link)
//     ZigZag 2                    → MediaText                (beat, with cta)
//   Section 4        → Heading + Text + Buttons  ("Where to start", two doors)
//   FaqList          → Accordion
//   BetaCTA          → CallToAction
//
// THE THREE SCHEMA NODES, and who emits each one now (none from the route body).
// Note the count: the coded page asserted NO HowTo — its Steps list was copy, not
// a guide — so its three steps ride the schema-free `steps` seam (BuildTimeline)
// and this document asserts none either. Adding one would be a new claim.
//   · Article    — app/(marketing)/calm-down-fast/page.tsx passes the page's own
//                  TITLE / DESCRIPTION / dates / three images to <BlockDocJsonLd>,
//                  so the node is unchanged from the coded page.
//   · FAQPage    — the Accordion block, from the six Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: all three real-gathering photos the coded page rendered (the multimodal
// AIO signal, §8b, and the E-E-A-T proof, §8e) are still ON the page — the hero
// photo plus two media beats — and still ride the route's Article node, unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/images/site/breathwork-circle.jpg'
const PRACTICE_IMAGE = '/images/site/meditation-circle-outdoor.jpg'
const COMMUNITY_IMAGE = '/images/site/nature-viewing-sunset.jpg'

export const spec: ArticleSpec = {
  slug: 'calm-down-fast',
  eyebrow: 'Always wired',
  title: 'How to calm down fast',
  subtitle:
    'It is late, you are exhausted, and you still cannot switch off. Wired and tired at the same time is one of the most common complaints adults have. Here is the fastest way down, and how to make it stick.',
  image: HERO_IMAGE,
  alt: 'A small group sitting in a circle outdoors, breathing together',
  heroCtaLabel: 'See the calming practices',
  heroCtaHref: '/discover/practices/pillar/body',

  answer:
    'To calm down fast, slow your exhale until it is longer than your breath in. That is the fastest lever you have, and it works in about a minute.',
  intro:
    'Breathe in through your nose for a count of four, then out slowly through your mouth for a count of six, and do that six times. A longer exhale tells your body it can ease off the gas. You might notice your shoulders drop by the third round. You might not. Either way you have done the thing, and the thing is what counts.',
  openingBeat: {
    kind: 'statement',
    text: 'Relaxing is not a decision. It is something you do with your body.',
    accent: 'It is something you do with your body.',
  },

  sections: [
    {
      question: 'Why am I always wired but tired?',
      answer:
        'Because the part of you that should stand down after a hard day never gets the signal. Being exhausted does not turn off being on alert.',
      body: 'Screens, news, and back-to-back demands keep you on low alert all day, so by night your body is still braced even though nothing is chasing you. That is why "just relax" never works. You cannot decide your way out of it. You can only send your body a clear, physical sign that the day is over, and a slow breath is the most reliable one there is.',
      beat: {
        kind: 'media',
        image: PRACTICE_IMAGE,
        alt: 'People sitting together on the grass with their eyes closed',
        eyebrow: 'What actually works',
        title: 'Small and repeated, not long and perfect.',
        body: 'The 60-second breath is for a crisis. The real win is making a short calming practice a habit, so your baseline comes down and you are not always rescuing yourself from the edge.\n\nThe Body practices are the short, physical ones: a breath, cold water on your face, a two-minute walk, a reset you can do before your coffee. None of them ask for an hour, a mat, or a certain mood.',
        side: 'left',
      },
    },
    {
      question: 'How do I make calm my baseline?',
      answer:
        'Do one small calming practice at the same moment every day, before you need it, not just when you are already over the edge. Three plain steps:',
      steps: [
        {
          name: 'Pick one anchor moment',
          text: 'The same spot every day. Before coffee, on the drive home, last thing before bed. Attach it to something you already do.',
        },
        {
          name: 'Keep it under five minutes',
          text: 'A minute of slow breathing counts. Short and done beats long and skipped. The point is the repeat, not the length.',
        },
        {
          name: 'Let the timer hold the space',
          text: 'When you want help, set a couple of minutes and let it count you down, so you are not also watching the clock.',
        },
      ],
      // The door to the timer step 3 describes (HYG-034). A BuildTimeline step carries no href
      // of its own, and every other CTA on this page pointed at a browse surface — so the page
      // that tells you to let a timer hold the space had no way to open one. `links` is the
      // shape this block already uses one entry down, so this is a data row, not a new control.
      links: [{ label: 'Open Mindless', href: '/on-air', variant: 'secondary' }],
      beat: {
        kind: 'statement',
        text: 'You do not have to fix your whole nervous system today. You have to take one slow breath.',
        accent: 'You have to take one slow breath.',
      },
    },
    {
      question: 'What if my phone is keeping me wired?',
      answer:
        'Then the breath will only get you so far, because the feed keeps topping the alert back up. The fix is a smaller, calmer evening, not more willpower at midnight.',
      body: 'If you scroll until your eyes hurt and then wonder why you cannot sleep, the phone is part of the loop. Calming down fast helps in the moment, and changing what your nights are made of helps for good. We wrote a whole piece on getting your evenings back from the feed, if that is the part that has its hooks in you.',
      links: [{ label: 'Read: life after the feed', href: '/loneliness', variant: 'secondary' }],
      beat: {
        kind: 'media',
        image: COMMUNITY_IMAGE,
        alt: 'A few people watching the sunset together from a quiet hillside',
        eyebrow: 'Where this lands',
        title: 'A standing time to come down, with company.',
        body: 'A lot of the always-on feeling eases when you are not alone with it. A Circle is a small local group that meets on a set rhythm, and plenty of them meet to breathe, walk, or sit together, so your week has a built-in moment to settle.\n\nYou do not have to be good at meditating or even like the word. You pick a short practice, find a few people near you, and show up. The standing time does the slow work of turning calm from a rescue into a routine.',
        side: 'right',
        ctaLabel: 'See how the community works',
        ctaHref: '/the-community',
      },
    },
    {
      question: 'Where to start',
      answer:
        'Try the 60-second breath right now, then pick one short practice to do at the same time tomorrow. When you want it to be a habit you keep, look at the Circles and events meeting near you and find a calm room to walk into.',
      links: [
        {
          label: 'See the calming practices',
          href: '/discover/practices/pillar/body',
          variant: 'primary',
        },
        { label: "See what's happening near you", href: '/discover', variant: 'secondary' },
      ],
    },
  ],

  faq: [
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
  ],

  close: {
    heading: 'Calm is a habit, not a lucky night.',
    body: 'Frequency hands you short practices and a room that meets on a rhythm, so coming down stops being a rescue. Join the Beta and find your calm.',
  },
}

export const data = articleTemplate(spec)
