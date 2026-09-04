import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS FOR COMMUNITY BUILDERS — the SEVENTH seeker article enrolled in the page
// editor (UX-MATURITY-PLAN Lift 5d, ADR-1068). The Labs-track pillar: "tools for
// community builders", "best tools to build a community", "community building
// software". It is the one article in the set that speaks to the Latent Leader /
// builder assembling the stack (CONTENT-VOICE §2b) rather than to the Seeker, so
// the register is operator-facing while the grammar stays the same. Relational
// register, no health claims.
//
// This file is a SPEC, not a document. The document is assembled by
// `articleTemplate` (templates/article.ts), which owns the CONTENT-VOICE §10.9
// article grammar — question H2s, the direct answer first, one concept per
// section, an FAQ, and the schema each block carries. Nothing structural is
// decided here; only the words.
//
// EVERY STRING BELOW IS THE COPY THE CODED ROUTE SHIPPED, verbatim. The conversion
// moved words between renderers; it did not rewrite them. Block for block, in order:
//   PhotoHero + Button → Hero (image)          (hero + heroCta)
//   Lead + Body        → Text                  (answer + intro)
//   PullQuote          → Statement             (openingBeat)
//   Section 1          → Heading + Text        (a way in)
//   Section 2          → Heading + Text        (a place to gather)
//     ZigZag 1                    → MediaText            (beat)
//   Section 3          → Heading + Text        (recognition)
//     Statement                   → Statement            (beat 1)
//     ZigZag 2 (reverse, cta)     → MediaText            (beat 2, carries the cta)
//   Section 4          → Heading + Text + Buttons  ("Where to start", two doors)
//   FaqList            → Accordion
//   BetaCTA            → CallToAction
//
// NO NEW SEAM. This article needed none: the seven optional fields the six prior
// enrolments added already cover everything it carries. It is the first enrolment
// that widened nothing, which is the point of the generator.
//
// THE THREE SCHEMA NODES, and who emits each one now (none from the route body).
// The coded page asserted NO HowTo, and neither does this document — there is no
// ordered guide on it, so `steps`/`howTo` are unused and no DawnHowToSteps block
// is composed. Inventing one would be a schema claim the coded page never made:
//   · Article    — app/(marketing)/tools-for-community-builders/page.tsx passes the
//                  page's own TITLE / DESCRIPTION / dates / three images to
//                  <BlockDocJsonLd>, so the node is unchanged from the coded page.
//   · FAQPage    — the Accordion block, from the six Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// Images: all three real-gathering photos the coded page rendered (the multimodal
// AIO signal, §8b, and the E-E-A-T proof, §8e) are still ON the page — the hero
// photo plus two media beats — and still ride the route's Article node, unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/images/site/group-of-friends.jpg'
const GATHER_IMAGE = '/images/site/breathwork-circle.jpg'
const STACK_IMAGE = '/images/site/community-1.jpg'

export const spec: ArticleSpec = {
  slug: 'tools-for-community-builders',
  eyebrow: 'The toolkit',
  title: 'Tools for community builders',
  subtitle:
    'A way in, a place to gather, a shared feed, and a little recognition. Four jobs, one stack. Here is what a community builder actually needs, and how to stop stitching five apps together.',
  image: HERO_IMAGE,
  alt: 'A group of friends standing close together outdoors, laughing',
  heroCtaLabel: 'Get the toolkit',
  heroCtaHref: '/spaces',

  answer:
    'A community builder needs four tools: a way in so new people can find you, a place to gather on a rhythm, a shared feed so the group stays connected between meetings, and a bit of recognition so people feel seen and come back.',
  intro:
    'That is the whole list. Most builders end up with a chat app, a calendar, a spreadsheet of members, and a payment link that none of them talk to, then spend their energy being the glue. This page walks the four jobs and shows how one Space covers them, so your time goes to the people, not the plumbing.',
  openingBeat: {
    kind: 'statement',
    text: 'Four apps that do not talk to each other is how good communities die tired.',
    accent: 'is how good communities die tired.',
  },

  sections: [
    {
      question: 'A way in: how do new people find you?',
      answer:
        'You need a public front door, a page a stranger can land on when they search for what you do. A private group chat has no way in.',
      body: 'This is the tool most communities skip, and it is why they stall at the same twelve people. On Frequency your community runs as a Space with a page in Discover, sorted under the Channels you list, so the neighbors who care about the same thing can actually find their way to your room. A front door plus a clear rhythm turns a closed circle into a place people can join.',
    },
    {
      question: 'A place to gather: what holds the group together?',
      answer:
        'A standing gathering on a rhythm, not a string of one-off events. The room is the product, and it needs a format so it lasts past week three.',
      body: 'Events tools are good at a single night and bad at the thing that actually builds community, which is the same people meeting again and again. On Frequency you host Circles that walk a Journey together as a Run, so a group keeps a shared thread week after week instead of starting cold each time. The format comes with it, so you are not inventing the night from scratch.',
      beat: {
        kind: 'media',
        image: GATHER_IMAGE,
        alt: 'A circle of friends sitting together outdoors for a shared practice',
        eyebrow: 'A shared feed',
        title: 'Keep the room warm between meetings.',
        body: 'A community is not only the hour you are in the room. It is the days in between, and those need somewhere to live. Channels give your people topics to gather around, and Dispatch lets you send an update or a reminder that lands with everyone at once.\n\nThe point is not more notifications. It is that the group stays connected between gatherings, so nobody has to wonder whether it is still happening. A warm feed between meetings is what makes the next meeting easy to say yes to.',
        side: 'left',
      },
    },
    {
      question: 'Recognition: what brings people back?',
      answer:
        'A little recognition, given honestly. People return to a group where showing up gets noticed, without it turning into a leaderboard grind.',
      body: 'On Frequency, real-world participation earns Zaps, and online activity earns Gems, so the people who keep showing up and pitching in get seen for it. The regulars can step up along a real path, from Member to Crew to Host to Guide, so recognition is not a gold star, it is a way to share the room. None of it uses guilt or fake streaks. It just tells people they belong here.',
      beats: [
        {
          kind: 'statement',
          text: 'You do not need five apps. You need four jobs, done in one place.',
          accent: 'You need four jobs, done in one place.',
        },
        {
          kind: 'media',
          image: STACK_IMAGE,
          alt: 'A small group gathered on a sunlit lawn, settled into easy conversation',
          eyebrow: 'How Frequency helps',
          title: 'The whole stack, in one Space.',
          body: 'Frequency Labs bundles the four jobs into a Space so you stop being the glue between apps. The front door lives in Discover, the gathering runs as Circles and Runs, the feed runs on Channels and Dispatch, and the recognition runs on Zaps and Gems. One place, one login, one room.\n\nYou keep your voice and your practice. The toolkit carries the parts that usually trip a builder up, so a community you are holding together by hand today can run on rails tomorrow.',
          side: 'right',
          ctaLabel: 'The operator playbook',
          ctaHref: '/how-to-build-community',
        },
      ],
    },
    {
      question: 'Where to start',
      answer:
        'The fastest way to get the toolkit is to claim a Space: your front door, your Circles, your feed, and your recognition in one place, free to start. If you want to see where the Labs toolkit is headed as a physical third space, tour The Lab. Both are the same idea at different sizes.',
      links: [
        { label: 'Get the toolkit', href: '/for/community-builders', variant: 'primary' },
        { label: 'Tour The Lab', href: '/the-lab', variant: 'secondary' },
      ],
    },
  ],

  faq: [
    {
      q: 'What tools do community builders need?',
      a: 'Four things: a way in so new people can find and join you, a place to gather on a rhythm, a shared feed so the group stays connected between meetings, and a bit of recognition so people feel seen and come back. Everything else is optional. Nail those four and you have the working parts of a real community.',
    },
    {
      q: 'Do I need separate apps for events, chat, and members?',
      a: 'No, and stitching four apps together is how most community builders burn out. A calendar tool, a chat app, a spreadsheet of members, and a payment link that none of them talk to means you spend your energy on plumbing instead of people. One place that handles membership, gatherings, the feed, and recognition together is far easier to actually keep running.',
    },
    {
      q: 'What is the best tool to build a community?',
      a: 'The best tool is the one that covers the four jobs, a way in, a place to gather, a shared feed, and recognition, without making you the glue between five other apps. Frequency Labs bundles them into a Space: a front door in Discover, Circles and Runs to gather, Channels and Dispatch for the feed, and Zaps and Gems for recognition, all in one place.',
    },
    {
      q: 'How do I get new people to find my community?',
      a: 'You need a public front door: a page people can actually land on when they search for what you do. A private group chat has no way in for a stranger. On Frequency your Space gets a page in Discover and sorts under the Channels you list, so the neighbors who care about the same thing can find their way to your room.',
    },
    {
      q: 'What keeps members coming back?',
      a: 'A steady rhythm and a little recognition. People return to a group where the time never moves and where showing up gets noticed. A shared feed keeps the room warm between meetings, and light recognition, a streak, a marker for the regulars, tells people they belong here without turning it into a leaderboard grind.',
    },
    {
      q: 'Do I need to be technical to use community-building tools?',
      a: 'No. Good community tools are built for a host, not an engineer. If you can set a time, send a message, and welcome someone new, you can run the software. The point of a toolkit like Frequency is to take the technical weight off you, so the job stays about the people in the room.',
    },
  ],

  close: {
    heading: 'Stop being the glue between five apps.',
    body: 'Frequency Labs puts the front door, the gatherings, the feed, and the recognition in one Space. Join the Beta and get the toolkit.',
  },
}

export const data = articleTemplate(spec)
