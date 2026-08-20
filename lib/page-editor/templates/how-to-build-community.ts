import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO BUILD COMMUNITY — the SECOND seeker article enrolled in the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). The Build-track pillar (CONTENT-VOICE
// §7b.2): how to build community, how to start a community group, how to host a
// recurring gathering, how to run a community space — the coded page had already
// absorbed the retired recurring-gathering and community-space guides, so this
// one article carries THREE ordered tracks.
//
// This file is a SPEC, not a document. The document is assembled by
// `articleTemplate` (templates/article.ts), which owns the CONTENT-VOICE §10.9
// article grammar — question H2s, the direct answer first, one concept per
// section, an FAQ, and the schema each block carries. Nothing structural is
// decided here; only the words.
//
// EVERY STRING BELOW IS THE COPY THE CODED ROUTE SHIPPED, verbatim. The conversion
// moved words between renderers; it did not rewrite them. Block for block, in order:
//   PageHero         → Hero (minimal — the coded hero had NO photo)
//   Lead + Body      → Text                      (answer + intro)
//   ZigZag 1         → MediaText                 (openingBeat)
//   Section 1        → Heading + Text            (+ DawnHowToSteps: STEPS)
//     ZigZag 2 + PullQuote        → MediaText + Statement    (beats)
//   Section 2        → Heading + Text            (+ DawnHowToSteps: RECURRING_STEPS)
//     ZigZag 3 + Statement        → MediaText + Statement    (beats)
//   Section 3        → Heading + Text            (+ DawnHowToSteps: SPACE_STEPS)
//     ZigZag 4                    → MediaText                (beat)
//   Section 4        → Heading + Text            (+ ZigZag 5 → MediaText beat)
//   Section 5        → Heading + Text            (+ PullQuote → Statement beat)
//   Section 6        → Heading + Text + Buttons
//   FaqList          → Accordion
//   BetaCTA          → CallToAction
//
// THE SIX SCHEMA NODES, and who emits each one now (none from the route body):
//   · Article    — app/(marketing)/how-to-build-community/page.tsx passes the page's
//                  own TITLE / DESCRIPTION / dates / three images to <BlockDocJsonLd>,
//                  so the node is unchanged from the coded page.
//   · HowTo ×3   — one per DawnHowToSteps block, each built from its section's
//                  `howTo` below. Each `intro` is the coded howToSchema call's
//                  `description`, verbatim, so the nodes keep their names,
//                  descriptions and every step. TWO DELTAS, stated not papered over:
//                  the second and third coded nodes passed an explicit `image`
//                  (community-dinner / mens-group); the block derives its image from
//                  the STEPS' photos and these steps have none, so those two nodes
//                  fall back to the site OG image (both photos are still ON the page
//                  and still in the Article node). And per-step `url` dropped: the
//                  coded value was the page's own URL on every step, carrying no
//                  deep-link information. Same two deltas as the first enrolment.
//   · FAQPage    — the Accordion block, from the thirteen Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: all five real-gathering photos (the multimodal AIO signal, §8b, and the
// E-E-A-T proof, §8e) are still ON the page, as the five media beats. The hero
// stays photo-less because the coded PageHero was photo-less — the spec leaves
// `image` out rather than inventing one.
// ─────────────────────────────────────────────────────────────────────────────

export const spec: ArticleSpec = {
  slug: 'how-to-build-community',
  eyebrow: 'Build',
  title: 'How to build community (and keep it going)',
  subtitle:
    'You do not have to build a whole community. You have to host one small group, on a regular rhythm, and keep showing up. Here is the short version, plus the rails so you are never out front alone.',

  answer:
    'To build community: pick one thing, set a standing time and place, keep it small, and meet again. That is the whole recipe, and it works whether you have done this before or never tried.',
  intro:
    'The mistake almost everyone makes is starting too big: a grand vision, a packed launch, a name and a logo before the first hello. Skip all of it. A community is just a small group that meets again, then again, until the people in it would notice if it stopped. The rest of this page is the whole builder path: start the group, host it on a rhythm, and run the room so it outlasts your worst week.',
  openingBeat: {
    kind: 'media',
    image: '/images/site/community-1.jpg',
    alt: 'A small neighborhood gathering of people sitting together outdoors',
    eyebrow: 'What this looks like',
    title: 'It starts smaller than you think.',
    kicker: 'A few neighbors and a standing time, not a movement and a logo.',
    body: 'This is a few neighbors who picked one night and kept it. No big launch, no audience, no plan for everything. One person set the day, held the door open more than once, and the rest filled in over time.\n\nThat is the whole shape of it, and you can do the same this week. You bring the people and the willingness to show up. We hand you a format you can run without inventing it. See how it fits together on [the community](/the-community).',
    side: 'left',
  },

  sections: [
    {
      question: 'How do I start a community group?',
      answer:
        'Pick one thing, set a time and place, keep it small, and meet again. Four plain steps, and you can take the first one this week.',
      howTo: {
        name: 'How to start a community group',
        intro: 'A simple, repeatable way to start and sustain a small community group.',
        steps: [
          {
            name: 'Pick one thing',
            text: 'Choose a single shared interest: a walk, a book, a meal, a sit. Narrow beats broad. People join a thing, not a vague idea of community.',
          },
          {
            name: 'Set a time and place',
            text: 'Same day, same spot, on a repeat. A standing rhythm is what lets a stranger become a regular. One-off events do not compound; a weekly slot does.',
          },
          {
            name: 'Keep it small',
            text: 'Five to ten people is plenty. Small groups feel safe and let everyone actually talk. You can always grow later; you cannot un-overwhelm a first night.',
          },
          {
            name: 'Meet again',
            text: 'The whole game is the second meeting, and the fifth. Familiarity does the work. Protect the rhythm even when it is small, and it will fill in over time.',
          },
        ],
      },
      beats: [
        {
          kind: 'media',
          image: '/images/site/group-of-friends.jpg',
          alt: 'A few friends hanging out together under a shade tent on a sunny afternoon',
          eyebrow: 'A Circle, up close',
          title: 'A few people, a standing time, a spot they can find.',
          kicker: 'No stage, no guru out front. Just regulars who keep coming back.',
          body: 'These are friends, not a following. One of them picked a thing, named a time, and kept showing up for it, and the people who cared about the same thing showed up too. That is the whole move.\n\nYou do not have to be the loudest person in the room or the one with all the answers. You have to be the reason there is a room. The format and the first-night plan come from us, so you are running a clear night instead of inventing one. Browse what people are running on [discover](/discover).',
          side: 'right',
        },
        {
          kind: 'statement',
          text: 'You do not have to build a community. Host one small group, more than once.',
          accent: 'Host one small group, more than once.',
        },
      ],
    },
    {
      question: 'How do I host a recurring gathering?',
      answer:
        'Pick a cadence you can keep, lock the same time and spot, write a simple run-of-show, and send a reminder before every meeting. It is a logistics job, not a charisma job.',
      body: 'The magic people chase is not what makes an event recur. The boring parts are: a time that never moves, a place people can count on, a format you can repeat without thinking, and a reminder that goes out every single time. Get those humming and the gathering keeps happening whether or not any one night is special. Here are the six steps that turn a one-off into a standing gathering.',
      howTo: {
        name: 'How to host a recurring gathering',
        intro:
          'The logistics of recurrence: cadence, a fixed time and spot, a run-of-show, reminders, shared roles, and a protected ritual.',
        steps: [
          {
            name: 'Pick a cadence you can actually keep',
            text: 'Weekly, every other week, or monthly, and be honest about which one you can hold for a year. A slower cadence you keep beats a fast one you drop. A gathering only becomes recurring once you have repeated the same slot enough times that people expect it.',
          },
          {
            name: 'Lock the same time and the same spot',
            text: 'Same day, same hour, same place, every time. A fixed slot lets people build a habit around it, and a fixed spot means nobody has to ask where. Moving the time to suit everyone is the fastest way to lose the regulars who had it penciled in.',
          },
          {
            name: 'Write a simple run-of-show',
            text: 'Sketch the shape of the night: how it opens, the main thing you do, how it closes. One page, reused every time. A light script means you are not reinventing the event on the day, and it lets a helper run it when you cannot make it.',
          },
          {
            name: 'Send the reminder every single time',
            text: 'A recurring gathering lives or dies on the reminder. Send the same short note before every meeting: when, where, and what to bring. Do not assume people remember. The reminder is not nagging, it is the thing that turns an intention into a turnout.',
          },
          {
            name: 'Share the load before you burn out',
            text: 'Hand off pieces early: someone sets up, someone greets newcomers, someone brings the coffee. A gathering that rides entirely on the host ends the first month the host is tired. Shared roles are what let a recurring event outlast any one person.',
          },
          {
            name: 'Protect the ritual, change the details',
            text: 'Keep the anchor, the time, the opening, the core thing, exactly the same, and let everything else flex. People come back for the parts that stay familiar. Change too much and it feels like a new event each time; keep the ritual and small tweaks keep it fresh.',
          },
        ],
      },
      beats: [
        {
          kind: 'media',
          image: '/images/site/community-dinner.jpg',
          alt: 'Friends gathered around a long table at night under string lights',
          eyebrow: 'What makes it recur',
          title: 'Protect the ritual, flex the details.',
          kicker: 'People come back to a plan that is easy to keep and hard to forget.',
          body: 'A moving time and a missing reminder are the two quiet killers of attendance. Nobody decides to stop coming; they just lose track, and the gap between meetings does the rest. Fix the slot so it lives in their week, and send the same short note before each one: when, where, and what to bring. That is not nagging. It is the thing that turns an intention into a turnout.\n\nThe anchor of a recurring gathering is the part that never changes: the time, the opening, the one thing you always do. Guard it, and let the details move around it. A Circle on Frequency runs the same shape every week and Dispatch sends the reminder for you, so the recurrence stops living in your head.',
          side: 'left',
        },
        {
          kind: 'statement',
          text: 'The quiet nights are not the failure. Cancelling is.',
          accent: 'Cancelling is.',
        },
      ],
    },
    {
      question: 'How do I run a community space?',
      answer:
        'Running a community space takes four plain things: a standing rhythm, a room you can reliably get, a few regulars who come back, and light tooling so the admin does not all fall on you.',
      body: 'Notice what is not on that list. No magnetic personality, no lease, no launch event. The rooms that last are held together by consistency and a simple format, and both of those are things you can set up on purpose. Run yours as a [Space](/spaces) and the front door, the format, and the reminders come built in. Here is the playbook, step by step.',
      howTo: {
        name: 'How to run a community space',
        intro:
          'The operator playbook: a standing rhythm, a room you can get, a core of regulars, real roles, a light format, and light tooling.',
        steps: [
          {
            name: 'Set one standing rhythm',
            text: 'Pick a day and time and repeat it without asking. The same Tuesday, weekly or every other week. A community space lives or dies on whether the rhythm holds, because people can only build a habit around a time that does not move.',
          },
          {
            name: 'Lock a room you can actually get',
            text: 'Find one spot you can reliably use on that rhythm: a park, a hall, a back corner, a living room. It does not need to be yours or impressive. It needs to be the same place enough weeks in a row that people stop asking where.',
          },
          {
            name: 'Grow a core of regulars',
            text: 'Aim for a handful who come back, not a crowd who came once. Three or four reliable regulars are the spine of a community space. Learn their names, notice when they miss, and let the room grow from the people who keep returning.',
          },
          {
            name: 'Hand out real roles',
            text: 'The moment you have a core, share the load. Someone brings the coffee, someone opens up, someone messages newcomers. A space that rides on one person ends the first hard month. Roles turn a room you run into a room a group holds.',
          },
          {
            name: 'Keep the format light and repeatable',
            text: 'Open the same way, do the thing, close the same way. A simple, repeatable shape lets people relax into the room instead of guessing what happens next, and it means you are not reinventing the night every time.',
          },
          {
            name: 'Use light tooling so it does not ride on you',
            text: 'Put the rhythm somewhere people can find it, send the reminder every time, and keep a simple record of who comes. A little tooling carries the admin that otherwise eats the host, so your energy goes to the room, not the logistics.',
          },
        ],
      },
      beat: {
        kind: 'media',
        image: '/images/site/mens-group.jpg',
        alt: 'A small group of men sitting in a circle outdoors, talking',
        eyebrow: 'What actually holds it',
        title: 'A few regulars beat a big crowd.',
        kicker: 'The spine is the three or four who come back whether it rains or not.',
        body: 'The spine of a community space is not the turnout on the good night. It is the three or four people who come back every time. Learn their names, notice when they miss, and treat them like the co-owners they are becoming.\n\nOnce you have that core, hand out roles. Someone brings the coffee, someone opens up, someone welcomes the newcomers. A room one person runs is fragile. A room a small group holds is hard to kill.',
        side: 'right',
      },
    },
    {
      question: 'Why do most groups fizzle out?',
      answer:
        'Because they lean on charisma and energy instead of structure. The host burns out, the rhythm slips, and the group quietly stops.',
      body: 'Groups do not usually die from low numbers. They die from chaos and burnout: a night that has to be reinvented every time, one person carrying all of it, no clear next date. The fix is boring and reliable: a format that repeats, small roles spread around, and a standing slot on the calendar that nobody has to decide on again.',
      beat: {
        kind: 'media',
        image: '/images/site/adult-play.jpg',
        alt: 'A small group on an oceanfront deck, one person upside down in a handstand while the others cheer',
        eyebrow: 'The rails',
        title: 'What do I do if I have never run a group before?',
        kicker: 'You set out the chairs. The format does the rest.',
        body: 'You do not start from a blank page. A Circle on Frequency comes with the rails: a format, a first-night script, a standing rhythm, and backup when you need it. The Circle runs the same shape every week, so the host is never improvising the night.\n\nYou do not need to be a natural leader. You need to set out the chairs and be the reason your people have somewhere to go. When you want the tooling that carries the admin, the [community builder toolkit](/tools-for-community-builders) is the whole kit in one place.',
        side: 'right',
        ctaLabel: 'Or start a Circle with the format built in',
        ctaHref: '/how-to-start-a-circle',
      },
    },
    {
      question: 'Do I have to do this alone?',
      answer:
        'No, and you should not. You step up exactly as far as you want, and every rung has the one above it for backup.',
      body: 'The path goes Member, then Crew, then Host, then Guide, then Mentor. You show up to a Circle as a Member. You learn the format as Crew. You hold one Circle as a Host, with the script and the backup handed to you. A Guide looks after the Hosts nearby, so nobody runs a room alone, and a Mentor keeps the Guides steady across a whole local community. Take whichever rung feels right, and step back any time.\n\nThat is the point of the structure: it is leaderful, not leader-dependent. Take any one person out and it keeps running, because the people and the rhythm were the thing all along. Frequency is a Community Collective, built to support every community effort and help everyone in it succeed together, so the rails are shared, not something you assemble alone.',
      beat: {
        kind: 'statement',
        text: 'Groups do not die from low numbers. They die from chaos and burnout.',
        accent: 'They die from chaos and burnout.',
      },
    },
    {
      question: 'Where do I start?',
      answer:
        'Pick what you practice, find a few people near you, and hold the door open for one Circle. Frequency hands community builders the format, the first-night script, and the rails, so hosting is a clear next step instead of a blank page.',
      body: 'You keep 100% of your own bookings, always. See exactly what a plan costs on the [pricing page](/pricing), month to month, leave anytime.',
      links: [
        { label: 'Host your first Circle', href: '/the-community', variant: 'primary' },
        { label: 'Run a group you already gather', href: '/spaces', variant: 'secondary' },
      ],
    },
  ],

  faq: [
    {
      q: 'How do I build community from scratch?',
      a: 'Pick one shared interest, set a standing time and place, keep the first group small, and commit to meeting again. You do not need a venue, a budget, or a big audience. You need one thing, a repeating rhythm, and the willingness to host the same small group more than once. Community is just a small group that keeps meeting until the people in it would notice if it stopped.',
    },
    {
      q: 'How do I start a community group?',
      a: 'Start with one small Circle, not a whole community. Pick something you already care about, name a standing day and place, and invite a few people near you. You do not need a plan for everything. You need one regular night and a format you can run without inventing it. Frequency hands you that format, the first-night script, and a person to call.',
    },
    {
      q: 'How many people do I need to start?',
      a: 'You can start with three or four. Small is a feature, not a failure: a handful of people who keep coming back beats a big launch that never meets again. A small room that fills feels warm; a big one that half-empties feels like a flop even when good people came. Protect the rhythm at small numbers and the group fills in over time.',
    },
    {
      q: 'How do I host a recurring gathering?',
      a: 'Pick a cadence you can keep, lock the same time and spot, write a simple run-of-show, and send a reminder before every meeting. A recurring gathering is a logistics job, not a charisma job. Get the time fixed, the format repeatable, and the reminder automatic, and the event keeps happening whether or not any single night is magical.',
    },
    {
      q: 'How often should a recurring gathering meet?',
      a: 'Weekly or every other week keeps faces familiar; monthly works if that is the honest most you can hold. The right cadence is the fastest one you can actually keep for a year, not the one that sounds impressive. Consistency matters far more than frequency: a monthly gathering that never skips beats a weekly one that fizzles by spring.',
    },
    {
      q: 'How do I get people to come back every time?',
      a: 'Keep the time fixed and send the reminder every single time. People come back to a gathering that is easy to plan around and hard to forget. A moving time or a missing reminder quietly kills attendance, while a standing slot and a short heads-up before each meeting turn a one-time crowd into regulars.',
    },
    {
      q: 'What does it take to run a community space?',
      a: 'Four plain things: a standing rhythm, a room you can reliably get, a few regulars who come back, and light tooling so the admin does not fall on one person. None of them is charisma or a big budget. A community space is held together by consistency and a simple format, not by a magnetic host or a fancy venue.',
    },
    {
      q: 'Do I need a venue, a building, or a budget?',
      a: 'No. A living room, a park, a hall, a cafe corner, or a video call all work. Most community spaces run in a room someone borrows. What makes it a community space is the standing rhythm and the regulars, not the lease. Start with a time and a spot you can get every week, and worry about walls much later, if ever.',
    },
    {
      q: 'What tools do I need to keep a group going?',
      a: 'Enough to hold the rhythm without it living in your head: a place people can see when you meet, a reminder that goes out every time, a way to message the group, and a simple record of who comes. Frequency bundles these into a Space so you are not stitching together four apps to run one room.',
    },
    {
      q: 'What if I host something and nobody comes back?',
      a: 'That usually means the format had no rhythm, not that you failed. People come back to a standing plan, not a one-off. Set the same day and place every week, keep it simple, and invite the people who showed up to the next one before they leave. Small, quiet nights are normal early; cancelling teaches people the event is not reliable, so hold it anyway.',
    },
    {
      q: 'Do I have to do this alone?',
      a: 'No. On Frequency you host one Circle on a path that goes Member, Crew, Host, Guide, Mentor, and every rung has the one above it for backup. You hold the room; a Guide looks after the Hosts nearby. You bring the people and the willingness to show up, and the structure carries the rest.',
    },
    {
      q: 'How do I keep a community group going long-term?',
      a: 'Keep the rhythm steady and the format light, and do not carry it alone. Hand out small roles, let the regulars help, and lean on a structure that already works instead of reinventing the night every time. Groups die from chaos and burnout, not from low numbers.',
    },
    {
      q: 'What does Frequency cost to build community here?',
      a: 'Connection is free: joining, Circles, and showing up never cost anything. Charging for what you host is free too, on every plan, including the free one. You keep 100% of your own bookings, always. Frequency is a Community Collective, so we earn only on the business the network brings you, at a rate that drops as your plan rises. See the plans on the pricing page. Month to month, take your data and leave anytime.',
    },
  ],

  close: {
    heading: 'Be the reason your people have somewhere to go.',
    body: 'We hand you the format and the script, so you are never building it alone. Join the Beta and start one Circle.',
  },
}

export const data = articleTemplate(spec)
