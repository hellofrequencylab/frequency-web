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

/** One named alternative we publish a comparison page for. Pure data. */
export interface Comparison {
  /** URL slug, e.g. "partiful". The page lives at /vs/<slug>. */
  slug: string
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

// The competitive set (build-plan §10 open decision 4 names these five). Each is
// a tool people reach for to gather others; Frequency is the standing community
// underneath the one-off. Copy is honest about what each is great at.
export const COMPARISONS: Comparison[] = [
  {
    slug: 'partiful',
    name: 'Partiful',
    category: 'party and event invite app',
    theyAreGoodAt:
      'Partiful makes one party easy. The invite looks good, the RSVPs land in one place, and the reminders send themselves. For a single night, it does the job well.',
    theDifference:
      'Frequency is built for the part after the party. A Circle is a small group that picks a day and keeps it, so the people you liked once become the people you see on a Tuesday. Sending the invite is the easy part. Holding the standing room is the harder part, and that is the whole point.',
    contrast: [
      { dimension: 'What it is', them: 'A one-off invite for a single event.', us: 'A standing Circle that meets again and again.' },
      { dimension: 'After the event', them: 'The thread goes quiet until the next party.', us: 'The same faces come back next week.' },
      { dimension: 'Finding people', them: 'You invite people you already know.', us: 'You find neighbors by what you care about.' },
      { dimension: 'Cost', them: 'Free.', us: 'Free to join during the beta.' },
    ],
    forReader:
      'You throw a good party, but the friendships never quite stick after. You want the repeat, not just the night.',
  },
  {
    slug: 'linktree',
    name: 'Linktree',
    category: 'link-in-bio page builder',
    theyAreGoodAt:
      'Linktree gives you one clean link for all your other links. Fast to set up, tidy to share. For sending a follower to your stuff, it works.',
    theDifference:
      'A Spotlight page on Frequency is a personal page too, but it points inward, not out. The goal is not one more click to somewhere else. It is to bring people into the same rooms you are in, so a tap turns into a table you both show up to. And when your page takes a booking or a sale, Frequency takes 0% on your own bookings. What your own work earns is yours.',
    contrast: [
      { dimension: 'What it is', them: 'A page of links to your other pages.', us: 'A personal page inside a real-world community.' },
      { dimension: 'Where it leads', them: 'Out, to your other profiles.', us: 'In, to Circles and events near you.' },
      { dimension: 'The goal', them: 'A click.', us: 'A face you see again in person.' },
      { dimension: 'On what you sell', them: 'Fees can apply to tips and sales.', us: '0% on your own bookings, always.' },
      { dimension: 'Cost', them: 'Free, with paid tiers.', us: 'Free to join during the beta.' },
    ],
    forReader:
      'You have the followers and the links. You are missing the part where it turns into people you actually know.',
    moneyBeat:
      'When your Spotlight page takes a booking or a sale, Frequency takes 0% on your own bookings, always. What your own work earns is yours. Frequency runs on one honest price and earns only a small, shrinking slice of the business the network brings you, never a cut of the business you bring yourself.',
  },
  {
    slug: 'calendly',
    name: 'Calendly',
    category: 'scheduling and booking tool',
    theyAreGoodAt:
      'Calendly kills the back-and-forth of finding a time. Send a link, someone picks a slot, the meeting lands on both calendars. For one-to-one scheduling, it is clean.',
    theDifference:
      'Frequency schedules the opposite of a one-off meeting: a standing time a small group keeps without re-asking every week. A Circle picks one day and holds it, so the calendar fills with the same faces, not a stream of new slots. And when a session you schedule is paid, Frequency takes 0% on your own bookings. The tool never taxes your work.',
    contrast: [
      { dimension: 'What it schedules', them: 'A one-to-one meeting, time by time.', us: 'A standing group time that repeats.' },
      { dimension: 'Who it is for', them: 'You and one other person.', us: 'A small group that meets as a Circle.' },
      { dimension: 'The pattern', them: 'A new slot every time.', us: 'The same day, every week or every other week.' },
      { dimension: 'On a paid booking', them: 'Paid bookings sit behind paid tiers.', us: '0% on your own bookings, always.' },
      { dimension: 'Cost', them: 'Free, with paid tiers.', us: 'Free to join during the beta.' },
    ],
    forReader:
      'You can book a meeting in seconds. You still want a standing thing with a few people that does not need re-booking.',
    moneyBeat:
      'Frequency takes 0% on your own bookings, always. When a session you schedule is paid, what you charge is yours to keep. Frequency runs on one honest price and earns only a small, shrinking slice of the business the network brings you, never a cut of the business you bring yourself.',
  },
  {
    slug: 'eventbrite',
    name: 'Eventbrite',
    category: 'event listing and ticketing platform',
    theyAreGoodAt:
      'Eventbrite is built to sell tickets to a real event. The listing, the payments, the door: all handled, and for a big paid one-off, it is the standard.',
    theDifference:
      'Frequency is built for the small, free, repeating room, not the ticketed one-off. Here is the sharpest line between them, and it is about money: Eventbrite charges a fee on every ticket you sell, while Frequency takes 0% on your own bookings, always. When you do charge for a gathering, what your work earns is yours. Frequency earns only a small, shrinking slice of the business the network brings you, never a cut of the business you bring yourself.',
    contrast: [
      { dimension: 'What it is', them: 'A ticketed event, often one time.', us: 'A free Circle that keeps meeting.' },
      { dimension: 'Getting in', them: 'You buy a ticket.', us: 'You find a Circle and show up.' },
      { dimension: 'After the event', them: 'It ends; the next one is unrelated.', us: 'The same group meets again.' },
      { dimension: 'On what you sell', them: 'A fee on every ticket you sell.', us: '0% on your own bookings, always.' },
      { dimension: 'Cost', them: 'Free and paid listings; fees on tickets.', us: 'Free to join during the beta.' },
    ],
    forReader:
      'You have been to plenty of events. You want the few that turn into people you keep seeing, not another ticket stub.',
    moneyBeat:
      'Eventbrite charges a fee on every ticket you sell. Frequency takes 0% on your own bookings, always. When you charge for a gathering, what your work earns is yours. Frequency runs on one honest price and earns only a small, shrinking slice of the business the network brings you, never a cut of the business you bring yourself.',
  },
  {
    slug: 'mighty-networks',
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
      { dimension: 'On what you sell', them: 'Fees can apply to what you sell.', us: '0% on your own bookings, always.' },
      { dimension: 'Cost', them: 'Paid, per creator.', us: 'Free to join during the beta.' },
    ],
    forReader:
      'You are in a few online communities already. What you are short on is people you can sit across a table from.',
    moneyBeat:
      'Frequency takes 0% on your own bookings, always. When you sell a session, a class, or a membership through your own work, what it earns is yours. Frequency runs on one honest price and earns only a small, shrinking slice of the business the network brings you, never a cut of the business you bring yourself.',
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
export interface ComparisonCopy {
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
    ? `Frequency vs ${c.name}: 0% on your own bookings`
    : `Frequency vs ${c.name}: a free alternative`
  const description = c.moneyBeat
    ? `An alternative to ${c.name}? Frequency is built for the small room that keeps meeting, and takes 0% on your own bookings. One honest price. See how they compare.`
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
      a: `Yes. Frequency is free to join during the beta. You can browse Circles and events near you, join one, and start showing up without paying anything. And Frequency takes 0% on your own bookings, always.`,
    },
    {
      q: `Who is Frequency for?`,
      a: `${c.forReader} Frequency is built for adults who want fewer screens and more standing, in-person plans with people who live close by.`,
    },
  ]

  return { h1, metaTitle, description, ogTitle, lede, faq }
}
