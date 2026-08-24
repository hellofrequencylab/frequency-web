import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'
import { FOUNDING_PLACE } from '@/lib/site'
import { priceStrings, CREW_NOTE } from '@/lib/pricing/pricing-page'
import { PLACEHOLDER_SPACE_PRICE_CENTS } from '@/lib/pricing/feature-tiers'
import { formatBps, formatCents } from '@/lib/pricing/display'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS FREQUENCY — the EIGHTH and LAST seeker article enrolled in the page
// editor (UX-MATURITY-PLAN Lift 5d, ADR-1068). The core story page: the
// answer-first explainer of the movement and the vision, distinct from /about
// (the founding NARRATIVE). It answers "what is Frequency?" in the first two
// sentences, then resolves the follow-on questions a newcomer actually asks.
//
// This file is a SPEC, not a document. The document is assembled by
// `articleTemplate` (templates/article.ts), which owns the CONTENT-VOICE §10.9
// article grammar — question H2s, the direct answer first, one concept per
// section, an FAQ, and the schema each block carries. Nothing structural is
// decided here; only the words.
//
// ⚠️ THE PRICE FIGURES ARE NOT FROZEN HERE. Every dollar figure and every rate
// interpolates from the SAME single source the coded route read (the code catalog
// via `priceStrings` + the feature-tiers placeholder maps + the take-rate config
// the fee code charges), so the ladder on this page can never drift from /pricing
// and no answer here can quote a rung the owner has retired. This is a SPEC, which
// is code, so it re-derives on every build exactly as the route did. The one thing
// that CAN freeze them is an operator publishing this document from the editor:
// the published rung wins over the template, and a published document is stored
// text. That is the same trade every enrolled article makes with its copy; it is
// named here because on this page the copy is a number.
//
// EVERY STRING BELOW IS THE COPY THE CODED ROUTE SHIPPED, verbatim. The conversion
// moved words between renderers; it did not rewrite them. Block for block, in order:
//   PhotoHero + Button → Hero (image)              (hero + heroCta)
//   Lead + Body        → Text                      (answer + intro)
//   PullQuote          → Statement                 (openingBeat)
//   Section 1          → Heading + Text (+ DawnHowToSteps: the three steps the
//                        coded page mirrored into its ONE HowTo node, as the
//                        section's own `howTo`, so the steps and the node stay one
//                        array) + Text (the taxonomy paragraph that sat BELOW the
//                        steps, riding the new `afterSteps` seam)
//   Section 2          → Heading + Text            (what is a Circle)
//   Section 3          → Heading + Text            (how it grows)
//   Section 4          → Heading + Text            (The Lab)
//   Section 5          → Heading + Text            (not a social media app)
//     PullQuote 2                 → Statement                (beat)
//   Section 6          → Heading + Text            (why it exists)
//     Statement                   → Statement                (beat)
//   Section 7          → Heading + Text + Buttons  (who it is for, + /pricing)
//   Section 8          → Heading + Text + Tiers + Buttons  (the ladder, on the new
//                        `tiers` seam, ABOVE the button exactly as coded)
//   Section 9          → Heading + Text + FeatureGrid  (the three sibling pillars,
//                        on the new `cards` seam)
//     ZigZag                      → MediaText                (beat, carries the cta)
//   FaqList            → Accordion
//   BetaCTA            → CallToAction
//
// THE FOUR SCHEMA NODES, and who emits each one now (none from the route body):
//   · Article    — app/(marketing)/what-is-frequency/page.tsx passes the page's own
//                  TITLE / DESCRIPTION / dates / hero image to <BlockDocJsonLd>, so
//                  the node is unchanged from the coded page. NOTE it passes the
//                  LONG `DESCRIPTION`, not the trimmed `META_DESCRIPTION`: the coded
//                  articleSchema call used the long one and the SERP snippet used the
//                  short one, and both still do.
//   · HowTo      — the DawnHowToSteps block, built from section 1's `howTo` below.
//                  `intro` is the coded howToSchema call's `description`, verbatim,
//                  so the node keeps its name, description and all three steps. The
//                  coded page asserted exactly ONE HowTo, and so does this document.
//                  ONE DELTA, stated not papered over (the same one as every prior
//                  enrolment): the coded node passed an explicit image (the hero
//                  photo); the block derives its image from the STEPS' photos and
//                  these steps have none, so the node falls back to the site OG image
//                  (the hero photo is still in the Article node). The coded steps
//                  carried no per-step url, so nothing else moves.
//   · FAQPage    — the Accordion block, from the twelve Q&A in `faq` below.
//   · Breadcrumb — still the route's own <JsonLd>.
//
// THREE VISIBLE DELTAS, named rather than discovered later. None of them loses a word:
//   1. `DawnHowToSteps` renders its own name and intro above the steps, so section 1
//      now prints "How does Frequency work?" a second time and shows the HowTo
//      description as a lead line. Both strings were already on this page or in its
//      schema; the block simply shows what it asserts. The alternative was to drop
//      the HowTo node, which is the LIVE-040 failure exactly.
//   2. The tier ladder renders as `Tiers` cards rather than the coded compact list.
//      All four fields per rung survive (name, price, who it is for, the network-only
//      rate); only the arrangement changed.
//   3. The three sibling-pillar cards read "Learn more" instead of the coded
//      "Read more". That word belongs to the FeatureGrid block, not to the spec.
//      Also: the second pull quote accented TWO words ("followed" and "joined"); the
//      `Statement` block accents one substring, so "followed" carries the accent and
//      "joined" reads plain. Styling, not copy.
//
// Images: both real-gathering photos the coded page rendered are still ON the page —
// the hero photo and the closing media beat. The Article node keeps carrying ONLY the
// hero photo, exactly as coded (the beat photo was never in it).
// ─────────────────────────────────────────────────────────────────────────────

// Every dollar figure on this page interpolates from the ONE price source (the code catalog via
// priceStrings + the feature-tiers placeholder maps), so the ladder here can never drift from /pricing.
const P = priceStrings()
const INDEPENDENT_PRICE = formatCents(PLACEHOLDER_SPACE_PRICE_CENTS.independent)

// Every RATE interpolates from the take-rate config the fee code charges, so no answer here can quote a
// rung the owner has retired. The free Member rung LEADS, because selling is free on every tier and the
// reference rate is the one a reader starts on; the paid rungs are what buys it down. Verified Non Profit
// is zero, and Independent is off the network.
const TAKE = PRICING_DEFAULTS.take_rate
const MEMBER_RATE = formatBps(TAKE.member_free_bps)
const CREW_RATE = formatBps(TAKE.member_bps)
const BUSINESS_RATE = formatBps(TAKE.network_bps.business)
const NETWORK_RATES = `Member ${MEMBER_RATE}, Crew ${CREW_RATE}, Business ${BUSINESS_RATE}, Non Profit ${formatBps(TAKE.network_bps.nonprofit)}`
/** The 0%-forever half of the model, stated the same way everywhere it appears. */
const OWN_AUDIENCE_LINE =
  'It is 0% for good once the buyer is already yours, meaning they follow your Space, they are one of your members, they are in your contacts, or they have bought from you before. Frequency charges once for the introduction. After that they are your people, free.'

const HERO_IMAGE = '/images/site/community-1.jpg'
const BEGINS_IMAGE = '/images/site/community-dinner.jpg'

export const spec: ArticleSpec = {
  slug: 'what-is-frequency',
  eyebrow: 'The short version',
  title: 'What is Frequency?',
  subtitle:
    'Frequency is a Community Collective. Small local Circles, nearby Events, a real space to gather, and the tools creators and businesses need to grow together. You keep 100% of your own bookings.',
  image: HERO_IMAGE,
  alt: 'A small group sitting together on a sunlit lawn, settled into easy conversation',
  heroCtaLabel: "See what's happening near you",
  heroCtaHref: '/discover',

  answer:
    'Frequency is a Community Collective built to rebuild the third place: the spaces that are not home and not work where you are known by name. It gives a neighborhood everything it needs to gather in one place.',
  intro:
    'The corner cafe, the town square, the standing table: we traded them for feeds and followers and lost the room. Frequency is the deliberate rebuild. You find a few people near you, join a small group that meets on a rhythm, and show up in person. The creators, coaches, and businesses who host those groups get the booking, payment, and community tools to grow together, and keep 100% of their own bookings while they do. The app is only the thread that gets everyone into the room.',
  openingBeat: {
    kind: 'statement',
    text: 'Not a following to perform for. A few people who expect you on Thursday.',
    accent: 'A few people who expect you on Thursday.',
  },

  sections: [
    // The one Steps list the coded page mirrored into HowTo schema. Riding the
    // section's own `howTo` keeps the visible steps and the node one array.
    {
      question: 'How does Frequency work?',
      answer:
        'In three steps: pick what you practice, join a Circle near you, and show up in person. The same handful of faces keep landing in the same room.',
      howTo: {
        name: 'How does Frequency work?',
        intro:
          'Find your people by what you care about, join a small local Circle, and gather in person.',
        steps: [
          {
            name: 'Find your people',
            text: 'Pick what you care about and we point you at a few people near you who care about the same thing. No cold rooms, no starting from scratch.',
          },
          {
            name: 'Join a Circle',
            text: 'A small standing group that meets on a set rhythm. Show up once, then show up again. Familiarity does the slow work that effort cannot.',
          },
          {
            name: 'Gather in person',
            text: 'Events near you, and a physical space to land in. The connection happens face to face, in a real room, not in a feed.',
          },
        ],
      },
      // The taxonomy paragraph the coded page printed BELOW the steps (absorbed from
      // the retired /how-it-works explainer). `body` would put it above them.
      afterSteps:
        'Underneath those steps is a simple shape: four Pillars, then Channels, then Circles. The four Pillars are Mind, Body, Spirit, and Expression, the parts a whole life moves through. Inside a Pillar are Channels (breathwork, strength, supper clubs, sound), and a Channel is the thread that leads you to a Circle near you. You do not fill out a form or wait to be let in. You pick two words, Pillar and Channel, and you are in the room. See the four Pillars and how they fit together on [The Community](/the-community).',
    },
    {
      question: 'What is a Circle?',
      answer:
        'A Circle is a small group around something you care about that meets on a set rhythm, so the same handful of people keep ending up in the same room.',
      body: 'A walk, a supper table, a breathwork sit, a book. It is leaderful, not leader-dependent: everyone holds a piece of it, so it does not collapse the moment one person gets tired. You do not have to build a community from scratch. You set out the chairs for one Circle, and we hand you the format, the rhythm, and the first-night script.',
    },
    // ── Absorbed: the retired /how-it-works explainer ──────────────────────────
    {
      question: 'How does Frequency grow?',
      answer:
        'It spreads like cells, not franchises. Circles are built to divide, so a full one seeds a new one instead of keeping a waitlist.',
      body: 'When a Circle fills up, someone who was ready to step up starts the next one. A handful of neighboring Circles becomes a neighborhood, a few neighborhoods become a whole local community, and none of it is handed down from above. That is why it is built guru-free: leaderful, not leader-dependent. Take the same structure away from any one person and it keeps running, because the practices, the places, and the people were the point all along.',
    },
    {
      question: 'What is The Lab?',
      answer:
        'The Lab is the physical third space the community gathers in: a real place you can walk into, not another tab to open.',
      body: `Movement studios, a thermal circuit, a cold pool, a connection bar, and an events floor, tuned to bring you back to yourself and then back to each other. A feed can keep people warm between meetings; it cannot hold a sound bath or the hour after when nobody wants to leave. The first Lab is taking root in ${FOUNDING_PLACE}.`,
    },
    {
      question: 'Is Frequency a social media app?',
      answer:
        'No. Frequency is the opposite of a feed. There is no scroll to perform belonging for and no follower count to chase.',
      body: 'The whole point is to get the same few people into the same real room on a regular rhythm, then get out of the way. The app does the quiet logistics, who is meeting, where, and when, so the connection can happen face to face. Success looks like you closing the app and walking into a room, not opening it again.',
      beat: {
        kind: 'statement',
        text: "We don't want to be followed. We want to be joined.",
        accent: 'followed',
      },
    },
    {
      question: 'Why does Frequency exist?',
      answer:
        'Because the answer to the loneliest era in history is a folding chair with your name on it.',
      body: 'Frequency exists to rebuild the third place: a community designed to last, real physical homes for connection, and a business model that stays honest. We never take a cut of your own bookings. We earn only on the business the network sends you, a small take-rate that shrinks as your plan rises. It is built guru-free, to outlast any one person. We are not building a following. We are building infrastructure, the kind of thing you can lean your whole weight on.',
      beat: {
        kind: 'statement',
        text: "We're not building a following. We're building infrastructure.",
        accent: 'infrastructure',
      },
    },
    {
      question: 'Who is Frequency for?',
      answer:
        'Anyone who wants to belong, and everyone who brings people together: the creators, coaches, healers, and small businesses who host the Circles and run the rooms.',
      body: 'This is what makes Frequency a Community Collective. Independent hosts grow together instead of alone, share a Space and Events, and keep 100% of their own bookings. We earn only on what the network sends them. Nobody has to buy a plan to take money: a free Member sells tickets on day one. Plans climb from Member to Crew, Business, Collective, Non Profit, and Independent, and every step up lowers the small network-only take-rate instead of adding a bill. Four promises hold it honest: we never take a cut of your bookings, one honest price with no surprise invoices, month to month so you can leave anytime with your data, and a live readout of exactly what the network earned you.',
      links: [{ label: 'See the plans and take-rates', href: '/pricing', variant: 'secondary' }],
    },
    {
      question: 'How much does Frequency cost?',
      answer:
        'Joining is free, forever, and so is selling. Every plan below can sell tickets and take donations, and every plan keeps 100% of the bookings you bring in yourself. We earn only on the business the network sends you, and each step up the ladder buys that small rate down.',
      // The tier ladder, lifted for AIO so an answer engine can quote the whole shape
      // in one place. Take-rate shown is network-introduced only: anyone already yours
      // is 0% on every tier, for good. Prices and rates mirror /pricing and the FAQ.
      tiers: [
        {
          name: 'Member',
          price: 'Free',
          note: `${MEMBER_RATE} network only`,
          who: 'Belong to everything, host events, take RSVPs, and sell tickets. The full community, free forever.',
        },
        {
          name: 'Crew',
          price: `${CREW_NOTE.foundingLabel}/mo`,
          note: `${CREW_RATE} network only`,
          who: 'The same selling at a lower rate, plus the full game, your own Circles and Journeys, and the entry points that build your list.',
        },
        {
          name: 'Business',
          price: `${P.businessList}/mo`,
          note: `${BUSINESS_RATE} network only`,
          who: 'Own your audience: unlimited contacts, campaigns at volume, and exports.',
        },
        {
          name: 'Collective',
          price: `${P.collectiveList}/mo`,
          note: `${formatBps(TAKE.network_bps.collective)} network only`,
          who: 'Be the venue: team seats, automations, and Collaborator hosting.',
        },
        {
          name: 'Non Profit',
          price: `${P.nonprofit}/mo`,
          note: `${formatBps(TAKE.network_bps.nonprofit)} network only`,
          who: 'The full Collective toolkit, verified 501(c)(3).',
        },
        {
          name: 'Independent',
          price: `${INDEPENDENT_PRICE}/mo`,
          note: 'Off the network',
          who: 'White-label and standalone. Standard software, no network lift.',
        },
      ],
      links: [{ label: 'See the full pricing', href: '/pricing', variant: 'primary' }],
    },
    // Hub-and-spoke: cross-link the three sibling pillars. This page is the
    // canonical explainer; the triptych goes deep on each part.
    {
      question: 'Where can I go deeper?',
      answer:
        'This page is the short answer. Three sibling pages go deep on each part of Frequency.',
      cards: [
        {
          title: 'The Community',
          body: 'The four Pillars, your Channels, and how Circles grow on their own.',
          href: '/the-community',
        },
        {
          title: 'The Lab',
          body: 'The physical third space: movement studios, a thermal circuit, a cold pool.',
          href: '/the-lab',
        },
        {
          title: 'The Quest',
          body: 'The year-round game that turns practices into a rhythm you actually keep.',
          href: '/the-quest',
        },
      ],
      beat: {
        kind: 'media',
        image: BEGINS_IMAGE,
        alt: 'A backyard dinner at night, friends gathered around a long table under string lights',
        eyebrow: 'Where it begins',
        title: 'It starts with one Circle',
        kicker: 'The way real community has always spread: person to person, one room at a time.',
        body: `You do not have to be interesting or outgoing, and you do not have to arrive with friends. You pick what you practice, find a few people near you, and come back. The second time is when a stranger becomes a familiar face; the fifth time is when a familiar face becomes a friend.\n\nIt is taking root in ${FOUNDING_PLACE} first, the way it always has: following the people who start it, one Circle and one city at a time.`,
        side: 'left',
        ctaLabel: 'See how the community works',
        ctaHref: '/the-community',
      },
    },
  ],

  faq: [
    {
      q: 'What is Frequency?',
      a: 'Frequency is a Community Collective built to rebuild the third place: the spaces that are not home and not work where you are known by name. It gives a neighborhood everything it needs to gather in one place through small local Circles, nearby Events, and a physical space to meet, and gives the creators, coaches, and businesses who host them the tools to grow together, while everyone keeps 100% of their own bookings.',
    },
    {
      q: 'How does Frequency work?',
      a: 'Three steps. You pick what you practice (a Channel inside one of the four Pillars: Mind, Body, Spirit, Expression), join a Circle (a small standing local group that meets on a set rhythm), and show up to Events near you. The same handful of faces keep ending up in the same room, which is how strangers slowly become regulars and regulars become friends. The app handles the quiet logistics of who is meeting, where, and when, then gets out of the way.',
    },
    {
      q: 'What is a Circle?',
      a: 'A Circle is a small group around a shared interest that meets on a regular rhythm: a walk, a supper table, a breathwork sit, a book. It is leaderful, not leader-dependent, so it holds itself together instead of depending on one person to keep it alive.',
    },
    {
      q: 'What are the four Pillars?',
      a: 'The four Pillars are Mind, Body, Spirit, and Expression, the parts a whole life moves through. You start in the one calling you right now. Inside each Pillar are Channels, and inside each Channel are Circles near you.',
    },
    {
      q: 'What is a Channel?',
      a: 'A Channel is what you practice: a topic inside a Pillar, like breathwork, strength, supper clubs, or human relating. It connects you to people everywhere who care about the same thing, and it is the thread that leads you to a Circle near you.',
    },
    {
      q: 'How does a Circle grow?',
      a: 'Circles are built to divide, not to keep a waitlist. When one fills up it seeds a new Circle, led by someone ready to step up. A few neighboring Circles become a neighborhood, neighborhoods become a whole local community, and none of it is appointed from above.',
    },
    {
      q: 'What is The Lab?',
      a: 'The Lab is the physical third space the community gathers in: movement studios, a thermal circuit, a cold pool, a connection bar, and an events floor. The app is the thread that brings people together; the Lab is the room it lands in. The first one is taking root in ' + FOUNDING_PLACE + '.',
    },
    {
      q: 'Is Frequency a social media app?',
      a: 'No. Frequency is the opposite of a feed. There is no scroll to perform belonging for and no follower count to chase. It uses a light app only to get the same few people into the same real room on a regular rhythm, then gets out of the way.',
    },
    {
      q: 'How much does Frequency cost?',
      a: `Connection is free, and so is selling. Joining, Circles, and Events never cost anything, a business never pays for access to people, and every tier can sell tickets and take donations from day one. Frequency keeps 0% of your own bookings, always; we make our money only on a sale the network introduced, at ${NETWORK_RATES}. ${OWN_AUDIENCE_LINE} Plans run Member (free, which creates events, takes RSVPs, and sells tickets at the Member rate), Crew (${CREW_NOTE.foundingLabel}, which buys that rate down and lifts the caps), Business (${P.businessList}), Collective (${P.collectiveList}), Non Profit (${P.nonprofit}), and Independent (${INDEPENDENT_PRICE}). See the full ladder at /pricing.`,
    },
    {
      q: 'How does Frequency make money?',
      a: `Only on the business the network introduces, never on the work you bring yourself. Your own bookings, clients, and classes are 0%, always, and so are tips. When the network sells your work to someone you would not have reached alone, we take a small slice: ${NETWORK_RATES}. ${OWN_AUDIENCE_LINE} The physical spaces are funded separately, through a community-owned vehicle, not skimmed off your margin.`,
    },
    {
      q: 'What is the Community Collective?',
      a: 'Frequency is a Community Collective: a network where independent creators, coaches, healers, and small businesses grow together, and eventually build real-world spaces together. You keep 100% of your own bookings and we earn only on what the network sends you. Four promises hold it honest: we never take a cut of your bookings, one honest price with no surprise invoices, month to month so you can leave anytime with your data, and a live readout of exactly what the network earned you.',
    },
    {
      q: 'Where is Frequency available?',
      a: 'Frequency is taking root in ' + FOUNDING_PLACE + ', where the first Circles are forming and the first Lab is being built. It spreads the only way real community ever has: person to person, circle to circle, following the people who start them, one city at a time.',
    },
  ],

  close: {
    heading: 'Come see what it actually is.',
    body: "The fastest way to understand Frequency is to walk into one room. Join the Beta and we'll point you at the first move.",
  },
}

export const data = articleTemplate(spec)
