import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// FRIENDSHIP AS AN ADULT — the FOURTH seeker article enrolled in the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). The Seeker-track making-friends hub
// (CONTENT-VOICE §7a): how to make friends as an adult, why it is hard after 30,
// meeting people in a new city, finding like-minded people, and reconnecting
// with old friends. The coded page had already absorbed the three retired thin
// guides (/meet-people-new-city, /find-like-minded-people and
// /how-to-reconnect-with-old-friends, which 308 into it), so this one article
// carries the whole cluster. Pain-first, answer-first, relational register only.
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
//     Steps (3, no schema)        → BuildTimeline            (the new `steps` seam)
//     Statement                   → Statement                (beat)
//   Section 3        → Heading + Text
//     ZigZag 2 + Statement        → MediaText + Statement    (beats)
//   Section 4        → Heading + Text
//     Steps (3, no schema)        → BuildTimeline            (steps)
//     ZigZag 3                    → MediaText                (beat)
//   Section 5        → Heading + Text (+ DawnHowToSteps: the RECONNECT track, the
//                      one list the coded page mirrored into a HowTo node — here as
//                      the section's own `howTo`, so the steps and the node stay one
//                      array)
//     Statement                   → Statement                (beat)
//   Section 6        → Heading + Text
//     ZigZag 4                    → MediaText                (beat, with cta)
//   Section 7        → Heading + Text + Buttons  ("Where to start", four hub links)
//   FaqList          → Accordion
//   Statement        → Statement                 (closingBeat: the brand line)
//   BetaCTA          → CallToAction
//
// THE FOUR SCHEMA NODES, and who emits each one now (none from the route body):
//   · Article    — app/(marketing)/friendship-as-an-adult/page.tsx passes the page's
//                  own TITLE / DESCRIPTION / dates / five images to <BlockDocJsonLd>,
//                  so the node is unchanged from the coded page.
//   · HowTo      — the DawnHowToSteps block, built from section 5's `howTo` below.
//                  `intro` is the coded howToSchema call's `description`, verbatim,
//                  so the node keeps its name, description and all five steps. The
//                  coded page asserted exactly ONE HowTo, and so does this document:
//                  the other two step lists ride the schema-free `steps` seam. TWO
//                  DELTAS, stated not papered over (the same two as every prior
//                  enrolment): the coded node passed explicit images
//                  (community-dinner + the hero); the block derives its image from
//                  the STEPS' photos and these steps have none, so the node falls
//                  back to the site OG image (both photos are still in the Article
//                  node). And per-step `url` dropped: the coded value was the page's
//                  own URL on every step, carrying no deep-link information a search
//                  result does not already have.
//   · FAQPage    — the Accordion block, from the eleven Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: all five real-gathering photos the coded page rendered (the multimodal
// AIO signal, §8b, and the E-E-A-T proof, §8e) are still ON the page — the hero
// photo plus four media beats. The coded Article node's own five-image list (which
// swaps outdoor-group for community-dinner, a photo the page never rendered) is
// still fed to it by the route, unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg'
const PLAY_IMAGE = '/images/site/PHOTO-2020-10-07-14-38-02.jpeg'
const HOOP_IMAGE = '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg'
const SHARED_IMAGE = '/images/site/song-circle.jpg'
const CITY_IMAGE = '/images/site/outdoor-group.jpg'

export const spec: ArticleSpec = {
  slug: 'friendship-as-an-adult',
  eyebrow: 'Adult friendship',
  title: 'How to make friends as an adult',
  subtitle:
    'You used to make friends without trying. Now it feels like a second job. Here is what changed, and the small, repeatable thing that actually works.',
  image: HERO_IMAGE,
  alt: 'A group of friends gathered together on the beach',
  heroCtaLabel: 'Find a Circle near you',
  heroCtaHref: '/discover',

  answer:
    'You make friends as an adult by going back to the same place, with the same people, more than once. That is the whole trick, and almost nobody says it out loud.',
  intro:
    'Friendship needs repeated, unplanned time with the same faces. School, college, and your first jobs handed you that for free, so friendships formed on their own. Take it away and nothing replaces it by default. The part nobody taught us is how to build that proximity on purpose. The good news: it is a skill, which means it is learnable, and it is simpler than it sounds. Whether you are starting over in a new city, hunting for people who get you, or trying to reach back to a friend you drifted from, the move underneath all three is the same one.',
  openingBeat: {
    kind: 'statement',
    text: 'You did not get worse at friendship. The easy ways to meet people disappeared.',
    accent: 'The easy ways to meet people disappeared.',
  },

  sections: [
    {
      question: 'Why is it so hard to make friends after 30?',
      answer:
        'Because friendship used to be a side effect, and now it has to be a choice. Proximity used to be free; now you have to build it.',
      body: 'Every easy friendship you have ever made probably came from being stuck in the same place as someone, over and over: a hallway, a dorm, a first job. You did not network. You just kept running into the same people. By your thirties that constant exposure is gone, replaced by a calendar full of obligations and a commute that ends at your own front door. You move, you partner up, the old crew scatters, and your week fills with people you work with but would not call on a Saturday.',
      beat: {
        kind: 'media',
        image: PLAY_IMAGE,
        alt: 'Friends playing together on the beach',
        eyebrow: 'What actually builds it',
        title: 'Repetition, not chemistry.',
        body: 'The myth is that you make a friend in one magic conversation. The reality is that friendship is built from repetition: the same faces, the same room, enough times that small talk wears a groove into something real.\n\nA one-off mixer almost never produces a friend. A thing that meets every Thursday eventually does, almost without you noticing. The chemistry shows up after the reps, not before them.',
        side: 'left',
      },
    },
    {
      question: 'How do adults actually make friends?',
      answer:
        'By showing up to the same place on a regular rhythm and going back more than once. That is the entire mechanism. Three plain steps:',
      steps: [
        {
          name: 'Pick one standing thing',
          text: 'A class, a court, a walk, a Circle. Anything that meets on a set schedule near you.',
        },
        {
          name: 'Go back more than once',
          text: 'The second visit is when a stranger starts to become a familiar face. The fifth is when a familiar face starts to become a friend.',
        },
        {
          name: 'Let the rhythm do the work',
          text: 'You do not have to be charming. You have to be the person who is reliably there.',
        },
      ],
      beat: {
        kind: 'statement',
        text: 'The secret is not better small talk. It is the same room, more than once.',
        accent: 'It is the same room, more than once.',
      },
    },
    // ── Absorbed: find-like-minded-people ──────────────────────────────────────
    {
      question: 'How do I find like-minded people, not just more people?',
      answer:
        'Lead with the thing you actually care about and go where it is done in person, on a schedule. Do not look for friends in the abstract. Let the shared thing do the sorting.',
      body: 'Like-minded is less about agreeing on everything and more about caring about the same things in the same way. You can disagree about plenty and still be deeply like-minded, because what you have in common is what you point your attention at. So pick one interest, value, or practice, find a small group built around it that meets again, and show up. Everyone in that room already chose the same thing, so you start halfway to your people instead of from zero.',
      beats: [
        {
          kind: 'media',
          image: SHARED_IMAGE,
          alt: 'A group of people sitting in a circle singing together',
          eyebrow: 'What actually works',
          title: 'Lead with the thing, not the search.',
          body: 'The mistake is to go looking for like-minded people directly, as if they were the goal you walk in for. They are almost never found that way. They are found sideways, as the people who happen to be in the room you came to for the thing itself.\n\nA room organized around a shared thing has already done the hard filtering. The people who keep showing up for it are, almost by definition, your kind of people. If it feels like nobody gets you, it is usually because the rooms you are in were chosen by accident, not around what you care about most.',
          side: 'right',
        },
        {
          kind: 'statement',
          text: 'Your people are not hiding. They are in a room you have not been to twice.',
          accent: 'They are in a room you have not been to twice.',
        },
      ],
    },
    // ── Absorbed: meet-people-new-city ─────────────────────────────────────────
    {
      question: 'What if I moved here and do not know anyone?',
      answer:
        'Pick one recurring thing near your new place and become a regular at it fast. A new city has plenty of one-off events; what you need is the same room more than once.',
      body: 'A move wipes years of small overlaps to zero on day one. Back home you had the same gym, the same neighbors, the same faces at the same places, and friendships formed off all that accidental repetition. It is not that the people in your new city are colder. You just have not been in the same room as anyone here twice yet. The instinct is to say yes to everything and meet as many people as possible. The thing that actually works is smaller and more boring: pick one standing time and become a regular, not a tourist.',
      steps: [
        {
          name: 'Choose recurring over one-off',
          text: 'A weekly thing near you beats a big one-time mixer. You are buying repeats, and only a standing schedule sells them.',
        },
        {
          name: 'Show up twice before you judge it',
          text: 'The first time anywhere new is awkward for everyone. The second time is when faces start to feel familiar. Most people quit after one and conclude the city is cold.',
        },
        {
          name: 'Let the activity carry you in',
          text: 'Go for the walk, the class, the table, not to make friends. Walking in for a thing to do is easy. The friends arrive quietly behind it.',
        },
      ],
      beat: {
        kind: 'media',
        image: CITY_IMAGE,
        alt: 'A group of people gathered together outside on a sunny day',
        eyebrow: 'If you work from home',
        title: 'Build the contact your commute used to hand you.',
        body: 'When there is no office and no shared hallway, nobody is handing you faces on repeat. So a standing weekly group is not a nice-to-have, it is the main way you will meet anyone at all. Put one recurring thing in your week and protect it like a meeting.\n\nIt does not have to be big. One small group, same time each week, is enough to turn a city full of strangers into a few people who know your name. This is the same engine that makes friendship work at any age, just run in a place where you are starting from scratch.',
        side: 'left',
      },
    },
    // ── Absorbed: how-to-reconnect-with-old-friends (the one HowTo track) ──────
    {
      question: 'How do I reconnect with old friends who drifted?',
      answer:
        'Send one short, warm message that names a real memory, keep it light instead of apologetic, and offer one easy plan to actually see them. You did not fall out. You just stopped sending the text.',
      body: 'The thing that keeps most people stuck is not the friend, it is the story that too much time has passed to be allowed to reach out. It has not. The person on the other end almost certainly misses the same easy thing you do, and is waiting for someone to be the first to reach back. Be that someone, keep it small, and let the rest follow. Here is the whole move, in five plain steps:',
      howTo: {
        name: 'How to reconnect with an old friend',
        intro:
          'Reconnect with an old friend you drifted from: drop the guilt, send one short warm message, keep it light, and offer one easy plan to see them.',
        steps: [
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
        ],
      },
      beat: {
        kind: 'statement',
        text: 'You do not have to explain the silence. You have to send one warm line.',
        accent: 'You have to send one warm line.',
      },
    },
    {
      question: 'What if I am too shy or too busy?',
      answer:
        'Then a standing schedule is your friend. You do not need to be charming; you need to keep turning up.',
      body: 'Shy people make excellent regulars. When a group meets on a set rhythm, the pressure to perform drops away, because nobody is trying to win the room in one night. You just become the person who is always there, and being reliably present is what turns a stranger into a familiar face and a familiar face into a friend. Busy is the same problem: one recurring slot beats ten good intentions you never act on.',
      beat: {
        kind: 'media',
        image: HOOP_IMAGE,
        alt: 'People hooping together next to a palm tree',
        eyebrow: 'Where this lands',
        title: 'A standing room with the same faces.',
        body: 'A Circle is a small group around something you care about that meets on a set rhythm, so the same handful of people keep ending up in the same room. That is the repetition that makes friends, built in on purpose, and it is exactly the sorting a new city or a random social calendar never does for you.\n\nA Channel is what the Circle is about: one of the seven topics, from movement to creative to human relating. You pick what you practice, and the standing time does the slow work of turning a room of strangers into your people. Reach out to an old friend, then bring them into a room that meets again, so a friendship never has to rebuild from zero a second time.',
        side: 'right',
        ctaLabel: 'See how the community works',
        ctaHref: '/the-community',
      },
    },
    {
      question: 'Where to start',
      answer:
        'You can browse the Circles and events already happening near you and find a room to walk into, or read how the whole thing fits together first. Either way, the move is the same: pick one standing time and go back more than once. Frequency is a Community Collective built to help every local group get going, so if the room you want does not exist near you yet, that is the cue to start it.',
      links: [
        { label: 'Find a Circle near you', href: '/discover', variant: 'primary' },
        { label: 'See how the community works', href: '/the-community', variant: 'secondary' },
        { label: 'Read: lonely but not alone', href: '/loneliness', variant: 'secondary' },
        { label: 'Or start the room yourself', href: '/how-to-start-a-circle', variant: 'secondary' },
      ],
    },
  ],

  faq: [
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
  ],

  closingBeat: {
    kind: 'statement',
    text: 'Get people together. Do things on purpose.',
    accent: 'on purpose.',
  },

  close: {
    heading: 'Friendship is just a standing plan you keep.',
    body: 'Frequency hands you a room that meets on a rhythm, so the same people keep showing up. Join the Beta and find yours.',
  },
}

export const data = articleTemplate(spec)
