// ── Comparison ("alternative to X") page generator (GE11-1) ───────────────────
// One small, typed registry of the named alternatives we compare against, plus a
// pure generator that turns a competitor row into the page's copy, metadata, and
// JSON-LD inputs. Every "Frequency vs X" / "alternative to X" page is a row here,
// not a hand-built file: the route reads this registry, so adding a competitor is
// one entry, never a new page (the Growth OS "instances are data" principle).
//
// Voice + naming are locked (docs/CONTENT-VOICE, docs/NAMING): plain sentences,
// proper nouns carry the magic, no em dashes, no health claims, the skeptic test.
// We position honestly — we never knock the other tool, we say what it is good at
// and where Frequency is a different shape (real-world community, not a feature).
//
// Money copy is READ from PLAN_STORY (a leaf with no imports, ADR-1368), never retyped: selling starts
// at Business (ADR-1709), and a 0% claim carries "plus card processing" (LIVE-911).

import { PLAN_STORY } from '@/lib/pricing/plan-story'

/** One named alternative we publish a comparison page for. Pure data. */
export interface Comparison {
  /** URL slug, e.g. "partiful". The page lives at /vs/<slug>. */
  slug: string
  /** The day this comparison first shipped and the day its copy last changed (YYYY-MM-DD).
   *  They drive the Article datePublished and dateModified on /vs/<slug>, so an edit to this
   *  entry moves `updated` with it; the page has no editor row to read a timestamp from (SCAN-797). */
  published: string
  updated: string
  /** The competitor's display name, exactly as they spell it. */
  name: string
  /** The category an answer engine would file them under (for the H1 + meta). */
  category: string
  /** Beat one of the two-beat contrast: the easy thing the competitor nails.
   *  Plain, generous, no knock. Name what it is genuinely good at. */
  theyAreGoodAt: string
  /** Beat two: the harder thing Frequency is built for. Plain, no hype. Where the
   *  money model is the sharpest edge (a booking or ticketing tool that taxes your
   *  work), name it here: 0% on your own bookings vs their cut. */
  theDifference: string
  /** A short, scannable feature contrast. Each row: the dimension + each side. */
  contrast: ComparisonRow[]
  /** Who the page is for, in the reader's own words (Seeker or Latent Leader). */
  forReader: string
  /** Optional: the money-model answer, set only when the competitor charges
   *  against your own work (booking / ticketing / commerce). Plain and honest:
   *  0% on your own bookings, one honest price, network-only take-rate. Drives an
   *  extra FAQ (mirrored into schema) and the forward link to /pricing. */
  moneyBeat?: string
}

export interface ComparisonRow {
  /** The dimension being compared, in plain words. */
  dimension: string
  /** What the other tool does on this dimension. Honest, not a strawman. */
  them: string
  /** What Frequency does on this dimension. Plain, concrete. */
  us: string
}

// The competitive set. Each is a tool people reach for to gather others; Frequency is
// the standing community underneath the one-off. Copy is honest about what each is
// great at.
//
// OWNER RULING 2026-10-14: Linktree and Calendly are OUT (they framed Frequency as a
// link-in-bio or a booking tool, off both wings; /vs/linktree and /vs/calendly 301 to
// /vs), and Meetup and Facebook Groups are IN. Every claim about another product is a
// public, checkable fact about how it works (who pays, where it happens, what it takes
// to join), never a number, a fee rate or a ranking claim we cannot cite. A row we
// could not state with confidence was left out rather than softened.
//
// "Free to join, always." is gone from the Cost rows: it hid the paid tiers. Each Cost
// row now says the whole money line (PLAN_STORY): free to join and to host, Business
// when you start charging.
export const COMPARISONS: Comparison[] = [
  {
    slug: 'partiful',
    published: '2026-07-28',
    updated: '2026-10-14',
    name: 'Partiful',
    category: 'party and event invite app',
    theyAreGoodAt:
      'Partiful makes one party easy. The invite looks good, the RSVPs land in one place, and the reminders send themselves. For a single night, it does the job well.',
    theDifference:
      'Frequency is built for the part after the party. A Circle is a small group that picks a day and keeps it, so the people you liked once become the people you see on a Tuesday. Sending the invite is the easy part. Holding the standing room is the harder part, and that is the whole point.',
    contrast: [
      { dimension: 'What it is', them: 'A one-off invite for a single event.', us: 'A standing Circle that meets again and again.' },
      { dimension: 'After the event', them: 'The thread goes quiet until the next party.', us: 'The same faces come back again.' },
      { dimension: 'Finding people', them: 'You invite people you already know.', us: 'You find neighbors by what you care about.' },
      { dimension: 'Cost', them: 'Free.', us: 'Free to join and to host. Business when you start charging.' },
    ],
    forReader:
      'You throw a good party, but the friendships never quite stick after. You want the repeat, not just the night.',
  },
  {
    slug: 'eventbrite',
    published: '2026-07-28',
    updated: '2026-10-13',
    name: 'Eventbrite',
    category: 'event listing and ticketing platform',
    theyAreGoodAt:
      'Eventbrite is built to sell tickets to a real event. The listing, the payments, the door: all handled, and for a big paid one-off, it is the standard.',
    theDifference:
      "Frequency is built for the room that keeps meeting, not the one-off. Here's the sharpest line between them, and it's about money: Eventbrite charges a fee on every ticket you sell. On Frequency, hosting a gathering is free and selling tickets starts at Business, where a ticket sold to someone already yours carries no network fee, only card processing. Frequency earns a small fee only on a customer the network introduces, once, never a cut of the business you bring yourself.",
    contrast: [
      { dimension: 'What it is', them: 'A ticketed event, often one time.', us: 'A Circle or an event series that keeps meeting.' },
      { dimension: 'Getting in', them: 'You buy a ticket.', us: 'You find a Circle and show up.' },
      { dimension: 'After the event', them: 'It ends; the next one is unrelated.', us: 'The same group meets again.' },
      { dimension: 'On what you sell', them: 'A fee on every ticket you sell.', us: 'Selling starts at Business. 0% on your own audience, plus card processing.' },
      { dimension: 'Cost', them: 'Free and paid listings; fees on tickets.', us: 'Free to join and to host. Business when you start charging.' },
    ],
    forReader:
      'You have been to plenty of events. You want the few that turn into people you keep seeing, not another ticket stub.',
    moneyBeat:
      `Eventbrite charges a fee on every ticket you sell, to everyone, every time. ${PLAN_STORY.spine} ${PLAN_STORY.selling} ${PLAN_STORY.rate} Card processing applies to every sale, the same as anywhere you take a card.`,
  },
  {
    slug: 'mighty-networks',
    published: '2026-07-28',
    updated: '2026-10-14',
    name: 'Mighty Networks',
    category: 'online community platform',
    theyAreGoodAt:
      'Mighty Networks gives a creator one place to host an online community: a feed, courses, paid memberships, all in one app. For a digital membership business, it is well built.',
    theDifference:
      'Frequency points the other way, off the screen and into a room. The whole design pushes toward a table, a walk, a Circle of neighbors, not more time in a feed. The money shapes differ too: where a platform can take a cut of the memberships and courses you sell, Frequency takes 0% on your own bookings. It earns only on the business the network brings you, never on your own work.',
    contrast: [
      { dimension: 'Where it happens', them: 'Online: a feed, courses, chat.', us: 'In person: Circles and events near you.' },
      { dimension: 'What it rewards', them: 'Posting and engagement.', us: 'Showing up in real life.' },
      { dimension: 'Who runs it', them: 'One creator and their audience.', us: 'Neighbors who host a Circle, with the format handed to them.' },
      { dimension: 'On what you sell', them: 'Fees can apply to what you sell.', us: '0% on your own bookings, plus card processing.' },
      { dimension: 'Cost', them: 'Paid, per creator.', us: 'Free to join and to host. Business when you start charging.' },
    ],
    forReader:
      'You are in a few online communities already. What you are short on is people you can sit across a table from.',
    moneyBeat:
      'Frequency takes 0% on your own bookings, plus card processing. Hosting is free, and selling a session, a class, a ticket, or a membership starts at Business, once payouts are ready. Either way, what your own work earns is yours. Frequency runs on one honest price and earns a share only of the business the network brings you, never a cut of the business you bring yourself.',
  },
  {
    slug: 'meetup',
    published: '2026-10-14',
    updated: '2026-10-14',
    name: 'Meetup',
    category: 'group and event platform',
    theyAreGoodAt:
      "Meetup is built for groups around an interest. A group lists its events, members RSVP, and anyone can search for groups near them by topic. For finding a group that already exists, it's a familiar place to look.",
    theDifference:
      "Frequency is built for the few people you keep seeing, not the biggest group in town. A Circle is a small group of regulars that keeps meeting, and the Spaces that host them are on the same map. Running a group on Meetup takes a paid organizer subscription. On Frequency, hosting is free, and you pay only when you start charging.",
    contrast: [
      { dimension: 'What it is', them: 'Interest groups, each with a page of events.', us: 'Small Circles of regulars, and the Spaces that host them.' },
      { dimension: 'Finding people', them: 'Search groups by topic and location.', us: 'Browse the Circles and Events happening in your town.' },
      { dimension: 'Running a group', them: 'Organizers pay a subscription.', us: 'Hosting a Circle is free.' },
      { dimension: 'Cost', them: 'Free to join. Organizers pay.', us: 'Free to join and to host. Business when you start charging.' },
    ],
    forReader:
      "You've RSVP'd to a few groups and met good people once. You want the group where they know your name the second time.",
  },
  {
    slug: 'facebook-groups',
    published: '2026-10-14',
    updated: '2026-10-14',
    name: 'Facebook Groups',
    category: 'online group and discussion tool',
    theyAreGoodAt:
      'Facebook Groups make it easy to gather people online. A group is free to start, most people already have an account, and the posts, photos and events live in one place.',
    theDifference:
      "Frequency is built for the room, not the feed. A Circle is a small group that meets in person, and everything on the page points at the next time you'll see each other, not the next post. Standing comes from how often a group gathers, and nobody can pay to rank higher.",
    contrast: [
      { dimension: 'Where it happens', them: 'Online: posts, comments and a group feed.', us: 'In person: Circles and Events near you.' },
      { dimension: 'Getting in', them: 'A Facebook account, then join the group.', us: 'Find a Circle near you and show up.' },
      { dimension: 'For the host', them: 'Posts, events and admin tools inside Facebook.', us: 'Door check-in, reminders and a contact list of who came.' },
      { dimension: 'Cost', them: 'Free.', us: 'Free to join and to host. Business when you start charging.' },
    ],
    forReader:
      "You're in a dozen groups and watch the same names scroll by. You want a few of them across a table.",
  },
]

/** Look up one comparison by slug, or undefined. */
export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug)
}

/** Every comparison slug — drives generateStaticParams + the sitemap. */
export function comparisonSlugs(): string[] {
  return COMPARISONS.map((c) => c.slug)
}

// ── Generated copy (one place, so the page + metadata + JSON-LD never drift) ───

/** The page path for a comparison. Canonical everywhere. */
export function comparisonPath(slug: string): string {
  return `/vs/${slug}`
}

/** The fully-resolved, voice-compliant copy a comparison page renders. Pure. */
interface ComparisonCopy {
  /** H1, as the reader would search it: "Frequency vs Partiful". */
  h1: string
  /** Meta title (question/alternative framing an engine can lift). */
  metaTitle: string
  /** Meta + OG description, under ~160 chars, plain. */
  description: string
  /** A punchier OG title for social cards. */
  ogTitle: string
  /** The answer-first lede: the honest one-paragraph difference. */
  lede: string
  /** The page's answer-first FAQ pairs (also fed to FAQPage schema). */
  faq: { q: string; a: string }[]
}

/** Build the comparison page copy from a row. No I/O, fully testable. Titles and
 *  meta own both "Frequency vs X" and "alternative to X"; where the competitor
 *  taxes your work, the honest-money hook (0% on your own bookings) leads. */
export function comparisonCopy(c: Comparison): ComparisonCopy {
  const h1 = `Frequency vs ${c.name}`
  // Own the "alternative to X" query in every title, and lead with the money hook
  // on the tools that charge against your work. Titles stay under ~60 chars.
  const metaTitle = c.moneyBeat
    ? `Frequency vs ${c.name}: 0% on your own bookings, plus card processing`
    : `Frequency vs ${c.name}: a free alternative`
  const description = c.moneyBeat
    ? `An alternative to ${c.name}? Frequency is built for the small room that keeps meeting, and takes 0% on your own bookings, plus card processing. One honest price. See how they compare.`
    : `An alternative to ${c.name}? ${c.name} is a great ${c.category}. Frequency is a free local Circle that keeps meeting in person. See how they compare.`
  const ogTitle = `Frequency vs ${c.name}`
  const lede = `${c.theyAreGoodAt} ${c.theDifference}`

  const faq = [
    {
      q: `Is Frequency a good alternative to ${c.name}?`,
      a: `It depends what you want. ${c.theyAreGoodAt} If what you actually want is a small group that keeps meeting in person near you, Frequency is the better fit: you find a Circle, show up, and come back, and the same faces become real friends. ${c.name} and Frequency can sit side by side. One handles the one-off, the other holds the standing room.`,
    },
    {
      q: `What is the difference between Frequency and ${c.name}?`,
      a: `${c.theDifference}`,
    },
    // Money FAQ only where the competitor charges against your own work, so the
    // schema never asserts a claim the page does not make.
    ...(c.moneyBeat
      ? [
          {
            q: `What does Frequency cost to host on, compared to ${c.name}?`,
            a: `${c.moneyBeat}`,
          },
        ]
      : []),
    {
      q: `Is Frequency free?`,
      a: `Yes. Frequency is free to join, and it stays free. You can browse Circles and events near you, join one, host your own gathering, and take RSVPs without paying anything. Tips are open on every tier with no platform fee, plus card processing. Selling tickets and taking payments starts at Business, the plan you take when you start charging, and Frequency takes 0% on your own bookings, always.`,
    },
    {
      q: `Who is Frequency for?`,
      a: `${c.forReader} Frequency is built for adults who want fewer screens and more standing, in-person plans with people who live close by.`,
    },
  ]

  return { h1, metaTitle, description, ogTitle, lede, faq }
}
