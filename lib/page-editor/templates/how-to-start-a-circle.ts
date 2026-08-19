import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO START A CIRCLE — the FIRST seeker article enrolled in the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). SEO pillar on the Leader track
// (CONTENT-VOICE §7b.2): how to start a Circle, how to start a community group,
// how to run a recurring meetup that does not fizzle.
//
// This file is a SPEC, not a document. The document is assembled by
// `articleTemplate` (templates/article.ts), which owns the CONTENT-VOICE §10.9
// article grammar — question H2s, the direct answer first, one concept per
// section, an FAQ, and the schema each block carries. Nothing structural is
// decided here; only the words.
//
// EVERY STRING BELOW IS THE COPY THE CODED ROUTE SHIPPED, verbatim. The conversion
// moved words between renderers; it did not rewrite them. Block for block, in order:
//   PhotoHero        → Hero                      (hero)
//   Lead + Body      → Text                      (answer + intro)
//   PullQuote        → Statement                 (openingBeat)
//   Section 1        → Heading + Text            (+ MediaText beat, was ZigZag)
//   Section 2        → Heading + Text            (+ DawnHowToSteps, was Steps)
//                                                (+ Statement beat, was Statement)
//   Section 3        → Heading + Text + Buttons  (+ MediaText beat, was ZigZag)
//   Section 4        → Heading + Text
//   Section 5        → Heading + Text + Buttons
//   FaqList          → Accordion
//   BetaCTA          → CallToAction
//
// THE FOUR SCHEMA NODES, and who emits each one now (none from the route body):
//   · Article   — app/(marketing)/how-to-start-a-circle/page.tsx passes the page's
//                 own TITLE / DESCRIPTION / dates / three images to <BlockDocJsonLd>,
//                 so the node is unchanged from the coded page.
//   · HowTo     — the DawnHowToSteps block, built from `howTo` below. `intro` is the
//                 page DESCRIPTION on purpose: the block feeds it to the HowTo
//                 `description`, which is what the coded howToSchema passed.
//   · FAQPage   — the Accordion block, from `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: the three real-gathering photos are the multimodal AIO signal (§8b) and the
// E-E-A-T proof (§8e). All three are still ON the page (hero + two media beats) and
// all three are still in the Article node.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/images/site/community-1.jpg'
const ROOM_IMAGE = '/images/site/mens-group.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

/** The page's meta description. Also the HowTo `description`, exactly as the coded
 *  route passed it, so the node does not change on conversion. */
const DESCRIPTION =
  'How to start a Circle: pick one thing, set a standing time, invite a few people, and run the same simple format until the same faces come back.'

export const spec: ArticleSpec = {
  slug: 'how-to-start-a-circle',
  eyebrow: 'For the natural connector',
  title: 'How to start a Circle',
  subtitle:
    'You keep wishing this town had more going on. You can be the reason it does. Starting a Circle is smaller than it sounds: one thing, a standing time, a few people. Here is how.',
  image: HERO_IMAGE,
  alt: 'A small group of friends gathered closely together, talking and laughing',
  heroCtaLabel: 'See how Circles work',
  heroCtaHref: '/the-community',

  answer:
    'To start a Circle, pick one simple thing to do together, set a standing time, and invite a few people to the first one. You are not building a community. You are starting one small room that meets again.',
  intro:
    'The instinct is to plan something big and worry about whether anyone will come. The thing that actually works is much smaller: one activity, the same time each week, and a handful of people you would like to see again. Get those repeating and the group builds itself from the people who keep showing up.',
  openingBeat: {
    kind: 'statement',
    text: 'You do not have to build a community. Host one Circle. We hand you the format.',
    accent: 'Host one Circle. We hand you the format.',
  },

  // The steps sit after section 2, exactly where the coded page put them, so the
  // reading order is unchanged by the conversion.
  howToAfter: 2,

  sections: [
    {
      question: 'How many people do I need to start a group?',
      answer:
        'Three or four who actually show up beats a list of twenty who might. Start smaller than feels impressive.',
      body: 'A small room that fills feels warm and easy to be in. A big one that half-empties feels like a flop even when six good people came. So invite a handful you genuinely want to see again, tell them exactly when and where, and let the group grow from the people who came back, not from the size of the first invite list.',
      beat: {
        kind: 'media',
        image: ROOM_IMAGE,
        alt: 'A small group of men sitting in a circle outdoors, talking',
        eyebrow: 'What actually works',
        title: 'Consistency, not charisma.',
        body: 'The myth is that good groups need a magnetic host carrying every night. The truth is quieter: groups live or die on whether the time stays the same and the format is simple enough to repeat without you performing.\n\nPick a day, keep it, and run the same light shape each time. That is what lets people relax into a room instead of wondering what is happening. A steady, ordinary rhythm turns strangers into regulars faster than any amount of energy.',
        side: 'left',
      },
    },
    {
      question: 'What are the steps to start a Circle?',
      answer:
        'Pick one thing, set a standing time, invite a few people, run the same simple format, and keep showing up. Five plain steps:',
      beat: {
        kind: 'statement',
        text: 'You do not have to get it perfect. You have to hold the same time twice.',
        accent: 'You have to hold the same time twice.',
      },
    },
    {
      question: 'Why do most community groups fizzle out?',
      answer:
        'Because they lean on one person’s energy instead of a structure anyone can keep. Groups die from inconsistency and burnout, not from a quiet host.',
      body: 'When the whole thing rides on the founder being on every week, it ends the first time they are tired, traveling, or having a hard month. A fixed time and a simple, repeatable format take the weight off any single person, so the Circle survives an off night. Build the rails first and the room can outlast your worst week.',
      links: [{ label: 'See the path we hand new hosts', href: '/the-quest', variant: 'secondary' }],
      beat: {
        kind: 'media',
        image: TABLE_IMAGE,
        alt: 'Friends gathered around a long table at night under string lights',
        eyebrow: 'Where this lands',
        title: 'We hand you the rails.',
        body: 'A Circle on Frequency is exactly this small repeating room, with the parts that usually trip people up already built. You get the format, the rhythm, and the simple opening and closing, so you can host without inventing the night from scratch.\n\nYou bring the one thing you want to gather around and the few people you want in the room. We hand you the structure that keeps it going after the first burst of energy fades, so it becomes a standing part of people’s week.',
        side: 'right',
        ctaLabel: 'See how the community works',
        ctaHref: '/the-community',
      },
    },
    {
      question: 'What does it cost to start a Circle?',
      answer: 'Nothing. Starting a Circle and gathering a few people is free, and it stays free.',
      body: 'Frequency is a Community Collective, built to support every community effort and help everyone in it succeed. So you never pay to host, and we never take a cut of your own bookings. If your Circle later grows into something you sell tickets or services through, you do not need a plan for that either: selling is open on a free account from day one, at one honest [price](/pricing), and you see exactly what the network earned you.',
    },
    {
      question: 'Where to start',
      answer:
        'Look at the Circles already meeting near you to see the shape of it, then pick one thing, one time, and a few people, and hold your first one. If you would rather find your people before you host, start there instead.',
      body: 'Both doors lead to the same room. For the longer builder’s guide, from a first gathering to a group that runs itself, read [how to build community](/how-to-build-community).',
      links: [
        { label: 'See how Circles work', href: '/the-community', variant: 'primary' },
        { label: 'Find a Circle near you', href: '/discover', variant: 'secondary' },
      ],
    },
  ],

  howTo: {
    name: 'How to start a Circle',
    intro: DESCRIPTION,
    steps: [
      {
        name: 'Pick one thing, not a community',
        text: 'Choose a single, simple thing the group does together: a walk, a dinner, a book, a morning swim. One activity people can show up for without explaining themselves. You are not founding an organization, you are starting one repeating room.',
      },
      {
        name: 'Set a standing time and keep it',
        text: 'Pick a day and time and repeat it without asking. The same Tuesday, every week or every other week. A standing slot beats a perfect one because friendship runs on repeats, and a moving target gives you none.',
      },
      {
        name: 'Invite a few people, not everyone',
        text: 'Personally ask five or six people you would actually like to see again. A small room that fills is warmer than a big one that echoes. Tell them exactly when, where, and what you will do, so saying yes is easy.',
      },
      {
        name: 'Run the same simple format',
        text: 'Open the same way, do the thing, close the same way. A light, repeatable shape lets people relax into it instead of wondering what is happening. The format carries the night so you do not have to perform host.',
      },
      {
        name: 'Show up again, especially when it is small',
        text: 'The second and third meetings are where a Circle either becomes real or quietly dies. Some nights two people come. Hold the time anyway. Consistency, not charisma, is what turns strangers into regulars.',
      },
    ],
  },

  faq: [
    {
      q: 'How do I start a Circle?',
      a: 'Pick one simple thing to do together, set a standing time, and personally invite five or six people to the first one. Do not try to build a whole community. Start one small repeating room around a single activity, run the same easy format, and come back next time. The group is built from the repeats, not from the launch.',
    },
    {
      q: 'How many people do I need to start a group?',
      a: 'Three or four who actually show up beats a list of twenty who might. A small room that fills feels warm; a big one that half-empties feels like a failure even when it is not. Start tiny on purpose and let it grow from people who came twice.',
    },
    {
      q: 'How often should a Circle meet?',
      a: 'Weekly or every other week, on the same day, is the sweet spot. Often enough that faces stay familiar between meetings, rare enough that you can keep the commitment for months. The exact cadence matters far less than keeping it the same.',
    },
    {
      q: 'What do you actually do at a Circle meeting?',
      a: 'One simple thing, the same way each time. A walk, a shared meal, a practice, a conversation with a light opening and closing. A repeatable shape lets people relax instead of guessing what happens next, and it means you do not have to reinvent the night every time.',
    },
    {
      q: 'Why do most community groups fizzle out?',
      a: 'Because they lean on one person’s energy instead of a structure anyone can keep. Groups die from inconsistency and burnout, not from a lack of charisma. A fixed time and a simple format that does not depend on the founder being on are what keep a group alive after the novelty wears off.',
    },
    {
      q: 'Do I have to be an extrovert to host a Circle?',
      a: 'No. Hosting is mostly logistics and consistency, not performance. If you can pick a time, send a few invites, and keep showing up, you can hold a Circle. Quiet, reliable hosts often build the steadiest groups, because the room feels safe rather than run.',
    },
    {
      q: 'What does it cost to start a Circle?',
      a: 'Nothing. Starting a Circle and gathering a few people is free, and it stays free. Frequency is a Community Collective built to support every community effort, so you never pay to host and we never take a cut of your own bookings. If your Circle grows into something you sell tickets or services through, you do not need a plan for that either: selling is open on a free account from day one, at one honest price, and you see exactly what the network earned you.',
    },
  ],

  close: {
    heading: 'The town you wish you lived in starts with one room you hold.',
    body: 'Frequency hands you the format, the rhythm, and a place to gather a few people on repeat. Join the Beta and start your Circle.',
  },
}

export const data = articleTemplate(spec)
