import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO BE MORE SOCIAL — the SIXTH seeker article enrolled in the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). The social-confidence pillar
// (CONTENT-VOICE §7a): how to be more social, feeling less awkward in groups,
// and building a social life without drinking. The coded page had already
// absorbed the two retired thin guides (/feel-less-awkward-in-groups and
// /social-life-without-drinking, which 301 into it), so this one article
// carries the whole cluster. Answer-first, relational register only, no health
// claims, no personality-fixing promises.
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
//   Section 2        → Heading + Text (+ DawnHowToSteps: the one Steps list the
//                      coded page mirrored into a HowTo node — here as the
//                      section's own `howTo`, so the steps and the node stay one
//                      array)
//     Statement                   → Statement                (beat)
//   Section 3        → Heading + Text            (the introvert reader)
//   Section 4        → Heading + Text            (absorbed: feel-less-awkward)
//     ZigZag 2                    → MediaText                (beat)
//   Section 5        → Heading + Text            (alone vs a friend)
//     Statement                   → Statement                (beat)
//   Section 6        → Heading + Text            (absorbed: without-drinking)
//     ZigZag 3 + ZigZag 4         → MediaText + MediaText    (beats; the second
//                                                             carries the cta)
//   Section 7        → Heading + Text + Buttons + Text  ("Where to start", two
//                      doors, then the "Keep going" cross-link line riding the
//                      new `note` seam so it stays BELOW the buttons, as coded)
//   FaqList          → Accordion
//   BetaCTA          → CallToAction
//
// THE FOUR SCHEMA NODES, and who emits each one now (none from the route body):
//   · Article    — app/(marketing)/how-to-be-more-social/page.tsx passes the
//                  page's own TITLE / DESCRIPTION / dates / five images to
//                  <BlockDocJsonLd>, so the node is unchanged from the coded page.
//   · HowTo      — the DawnHowToSteps block, built from section 2's `howTo` below.
//                  `intro` is the coded howToSchema call's `description`, verbatim,
//                  so the node keeps its name, description and all three steps.
//                  The coded page asserted exactly ONE HowTo, and so does this
//                  document. ONE DELTA, stated not papered over (the same one as
//                  every prior enrolment): the coded node passed an explicit image
//                  (the hero photo); the block derives its image from the STEPS'
//                  photos and these steps have none, so the node falls back to the
//                  site OG image (the hero photo is still in the Article node).
//                  The coded steps carried no per-step url, so nothing else moves.
//   · FAQPage    — the Accordion block, from the thirteen Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: all five real-gathering photos the coded page rendered (the multimodal
// AIO signal, §8b, and the E-E-A-T proof, §8e) are still ON the page — the hero
// photo plus four media beats — and still ride the route's Article node, unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/images/site/outdoor-group.jpg'
const RHYTHM_IMAGE = '/images/site/community-1.jpg'
const AWKWARD_IMAGE = '/images/site/song-circle.jpg'
const SOBER_IMAGE = '/images/site/group-singing.jpg'
const ROOM_IMAGE = '/images/site/community-dinner.jpg'

export const spec: ArticleSpec = {
  slug: 'how-to-be-more-social',
  eyebrow: 'Wanting to get out more',
  title: 'How to be more social',
  subtitle:
    'You keep meaning to. Then it is 6pm, you are tired, and the couch wins again. You do not need a new personality. You need one thing on the calendar and a reason to keep going back.',
  image: HERO_IMAGE,
  alt: 'A small group of friends outdoors together, relaxed and mid-conversation',
  heroCtaLabel: "See what's happening near you",
  heroCtaHref: '/discover',

  answer:
    'To be more social, pick one recurring thing you would actually show up for, put it on the calendar, and go back until people there know your name. It is a habit, not a personality.',
  intro:
    'The trap is treating sociability as a trait you either have or you do not. In practice it is just the result of being in the same room more than once. You do not have to become louder, funnier, or more outgoing. You have to remove the nightly decision of whether to leave the house, by committing to one standing thing and letting repetition carry the rest. This page covers the whole social-confidence problem: getting out of the house at all, feeling less awkward once you are in the room, and building a real social life that does not run through a bar.',
  openingBeat: {
    kind: 'statement',
    text: 'Being social is not a personality. It is a habit of showing up.',
    accent: 'It is a habit of showing up.',
  },

  sections: [
    {
      question: 'Why do I want to be social but always stay home?',
      answer:
        'Because staying home is the easy default and being social asks for a fresh decision every single time. The wanting and the choosing happen in different moments.',
      body: 'You feel the want in the abstract, on a Sunday, scrolling. You make the choice when you are tired at the end of a workday, and the couch always has the better pitch. It is not a willpower flaw and it is not proof you secretly prefer being alone. It is just that an open-ended evening will lose to the path of least resistance almost every time. The way out is to stop deciding nightly and decide once, by putting one thing on a fixed day.',
      beat: {
        kind: 'media',
        image: RHYTHM_IMAGE,
        alt: 'People gathered together outdoors at a community gathering, talking in small groups',
        eyebrow: 'What actually works',
        title: 'Beat the nightly decision with a fixed rhythm.',
        body: 'The single change that makes people more social is not confidence, it is a calendar. A recurring thing on a set day removes the part you keep losing: the choice. You are not deciding whether to go out tonight, you are just going to the thing you already do on Tuesdays.\n\nSo pick one room that meets again. Not a vague intention to see people more, but a specific group, class, or gathering with a time attached. Once it is a standing fixture, showing up stops being an act of will and starts being a habit, which is the whole game.',
        side: 'left',
      },
    },
    // The one Steps list the coded page mirrored into HowTo schema. Riding the
    // section's own `howTo` keeps the visible steps and the node one array.
    {
      question: 'How do I actually start?',
      answer:
        'Pick one recurring thing, commit to going three times, and treat it like an appointment you do not cancel. Three plain steps:',
      howTo: {
        name: 'How to be more social',
        intro:
          'Become more social by making showing up a habit instead of a nightly decision: pick one recurring thing, protect the time, and go back until the room is familiar.',
        steps: [
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
        ],
      },
      beat: {
        kind: 'statement',
        text: 'You do not need to be more outgoing. You need to go back a third time.',
        accent: 'You need to go back a third time.',
      },
    },
    {
      question: 'How can I be more social as an introvert?',
      answer:
        'Build on structure and small rooms instead of forcing yourself to work a crowd. You do not have to become an extrovert to have a full social life.',
      body: 'Introverts thrive in rooms where the activity does the talking, where the group is small enough to actually know, and where leaving early is fine. That is the opposite of a big loud party and far more sustainable. Pick a gathering built around a shared thing, see the same handful of faces each week, and let depth do what volume never could. Wanting fewer, closer connections is not a limitation to fix, it is a perfectly good way to be social.',
    },
    // ── Absorbed: feel-less-awkward-in-groups ──────────────────────────────────
    {
      question: 'How do I feel less awkward in groups?',
      answer:
        'Go back to the same small group more than once and let the activity carry the talking. Awkward is mostly the feeling of being new, and the only real cure for new is a second visit.',
      body: 'You cannot talk yourself out of feeling awkward, the same way you cannot decide to relax. When everyone is unfamiliar, you stay slightly on guard without meaning to, and that low hum of alert is what makes your sentences come out stiff. It is not a personality defect and it is not rare. It is the standard human response to a room you have never been in, and it quiets down the moment the faces stop being strange. The lever is picking a setting you return to, so no single night has to go well.',
      beat: {
        kind: 'media',
        image: AWKWARD_IMAGE,
        alt: 'People sitting in a circle singing together, at ease',
        eyebrow: 'What actually works',
        title: 'Let the activity do the talking.',
        body: 'The advice to "just be confident" is useless, because confidence is the result, not the lever. The lever is picking a setting with a built-in thing to do, so there is always an answer to "what now," and it is never "make small talk with a stranger."\n\nA walk, a class, a song circle, a shared table: each one hands you something to look at and do with your hands, so the conversation happens sideways, off the back of the activity, instead of head-on. Give your hands a job, hold a cup, help set up chairs, watch whoever is talking instead of scanning the room, and most of the awkwardness quietly goes with them.',
        side: 'right',
      },
    },
    {
      question: 'Should I go alone or bring a friend?',
      answer:
        'Go alone to a recurring group. Bringing a friend feels safer, but a friend is a comfortable place to hide, and you end up talking only to them.',
      body: 'Going alone is what actually makes you a regular, because it puts you in the room with the people who are already there. Let the first visit be quiet. You do not have to perform or win the room; showing up and watching counts, and a low-key first time just buys you an easier second one. The first time is awkward for everyone, so it tells you almost nothing. Come back before you decide anything. If you do bring someone, agree to split up for a while so the new room actually gets a chance.',
      beat: {
        kind: 'statement',
        text: 'You do not have to be the most comfortable person in the room. You have to walk in twice.',
        accent: 'You have to walk in twice.',
      },
    },
    // ── Absorbed: social-life-without-drinking ─────────────────────────────────
    {
      question: 'How do I build a social life without drinking?',
      answer:
        'Build it around an activity instead of around alcohol, and pick groups that meet on a schedule. When the point of the night is the thing you came to do, drinking stops being the centre of gravity.',
      body: 'The trap is thinking the choice is between drinking and staying home. It is not. Drinking became the easy shorthand for being social, the lowest-effort way to put bodies in a room together, but it is a thin kind of together: a night can feel close without much actually being shared, and the closeness is gone by morning. The fix is to change where you gather, not to white-knuckle the same bar with a soda water. Go where people meet around a shared activity in daylight and on a repeat schedule, a standing class, a morning run group, a community dinner, a circle built around an interest, and you are in a room of people who came for the thing, not the drinks. That is also the honest answer to how you meet people without going to bars.',
      beats: [
        {
          kind: 'media',
          image: SOBER_IMAGE,
          alt: 'A group of people gathered together singing, lit up and laughing, no drinks in sight',
          eyebrow: 'Where sober-curious people actually meet friends',
          title: 'Gather around the thing, not the drink.',
          body: 'In a room built around an activity, nobody is counting who has a drink and who does not, because that was never what the room was for. You are bonding over something real, and that is the kind of common ground a friendship can actually stand on. It is arguably easier to make friends this way, because the connection starts on the thing you both care about instead of on a buzz that evaporates by the next morning.\n\nWhen someone asks why you are not drinking, keep it short and light, then point at what you are doing instead. A plain "not tonight" is usually all anyone needs, and in a room that was never about drinking, the question simply never comes up.',
          side: 'right',
        },
        {
          kind: 'media',
          image: ROOM_IMAGE,
          alt: 'A backyard dinner at night, friends gathered around a long table under string lights',
          eyebrow: 'Where this lands',
          title: 'One standing room, already on the calendar.',
          body: 'A Circle is a small local group that meets on a rhythm, built around one shared thing, which is exactly the fixed room this whole page points to. You are not signing up to be outgoing, or to work a crowd, or to drink. You are signing up to be somewhere, on a day, with the same few people each time.\n\nYou pick the topic, find a few people near you who care about it too, and come back. We hand you the format and the rhythm, so the hardest part, leaving the house on a schedule, is already decided for you. It is free to join and free to show up.',
          side: 'left',
          ctaLabel: 'See how the community works',
          ctaHref: '/the-community',
        },
      ],
    },
    {
      question: 'Where to start',
      answer:
        'Look at the Circles and events meeting near you, pick the one you would genuinely show up for, drink or no drink, and put the next three dates in your calendar right now. If the thing you want to do does not exist near you yet, that is not a dead end, it is the cue to start the small standing room you wish you could walk into. Joining costs nothing, and Frequency never takes a cut of your own bookings, so you can [see exactly how the pricing works](/pricing) before you commit to anything.',
      links: [
        { label: 'Find something near you', href: '/discover', variant: 'primary' },
        { label: 'Or start the room yourself', href: '/how-to-start-a-circle', variant: 'secondary' },
      ],
      note: 'Keep going: [how to make friends as an adult](/friendship-as-an-adult), [how to meet people in a new city](/friendship-as-an-adult), and [feeling lonely but not alone](/loneliness).',
    },
  ],

  faq: [
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
  ],

  close: {
    heading: 'A fuller social life is mostly one thing on the calendar, kept.',
    body: 'Frequency gives you small local rooms that meet on a rhythm, so showing up stops being a nightly decision and new stops being scary. Join the Beta and pick your standing thing.',
  },
}

export const data = articleTemplate(spec)
