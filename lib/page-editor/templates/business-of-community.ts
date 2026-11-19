import type { Data } from '@/lib/page-editor/types'

// ─────────────────────────────────────────────────────────────────────────────
// THE BUSINESS OF COMMUNITY 101: the workshop sales page at /courses/business-of-community, expressed in
// the standard marketing blocks (the template IS the page, like the-lab.ts). An EDITABLE_PAGES slug, so
// Daniel can change these words in the page editor; a published document wins, this file is the last rung.
//
// SOURCE. The copy, section order and photos come from the house Space's sales page doc
// (scripts/seed-frequency-hq-boc-sales.mts, buildBocSalesDoc), rebuilt here from the marketing kit blocks
// instead of the New World Space-website blocks. Three deliberate deltas from that doc:
//   · The cohort Circle is never linked: it is a member route, and this page is public.
//   · Every "Save your seat" goes to the Funnel (BOC_FUNNEL_HREF), which signs a visitor up and lands
//     them on the Week 1 event. The event page itself is the secondary door.
//   · The questions are an Accordion, so the FAQPage node comes from the questions a visitor can read.
//
// THE SHAPE (owner 2026-11-17: "Remove the self paced course. This is just the workshop run periodically and the
// Business Hours cohort."). Two ways in: the live workshop (free, anyone, four 90-minute sessions on Zoom, run in
// cohorts) and Business Hours (a weekly hour for Spaces on the Business plan). The Journey is the workbook: lessons to
// read before each session. Every meeting the workshop teaches runs on PULSE, the five-beat rhythm every Frequency
// gathering uses, and so does each session. Facts: scripts/seed-frequency-hq-boc.mts (BOC_WEEKS, BOC_FAQ);
// this file keeps its own copy of the words because a lib module cannot import a seed script. Keep them in step.
//
// HONESTY CONTRACT (docs/CONTENT-VOICE.md). Course facts only. No prices, no testimonials, no outcomes we can't
// promise, no invented numbers. "Business" is a plan name per docs/NAMING.md and links /pricing. Certified is a
// certificate of completion and competency, not an accredited certification. Certified review is free for Community
// Books submitted by February 28, 2027 (the January launch workshop's window, owner decision 2026-11-17), then comes with
// the Business plan. The live workshop runs Thursdays January 7 to 28, 2027, inside the launch month (LAUNCH_ON).
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const
const EMPHASIS = { scale: 'default', accent: 'none' } as const

/** The DB-built Funnel for this workshop (scripts/seed-boc-funnel.sql). Completion lands on the Week 1 event. */
const BOC_FUNNEL_HREF = '/join?seq=business-of-community'
const START = 'Save your seat'

const PHOTOS = {
  backyard: '/sites/new-world/photos/backyard-class.webp',
  workshop: '/sites/new-world/photos/workshop-table.webp',
}

/** The live workshop's first session: RSVP happens on the Event (owner 2026-11-17: the button must open the
 *  event, not the calendar). Business Hours lives in its own members-only Circle. */
const CALENDAR = '/events/business-of-community-pilot-session-1'

/** The questions, shared with the llms-full corpus so the two say the same thing. */
export const BOC_FAQ: { q: string; a: string }[] = [
  {
    q: 'What does it cost?',
    a: 'Nothing. The workshop is free for anyone. Certified review is free for Community Books submitted by February 28, 2027, then comes with the Business plan.',
  },
  {
    q: 'When is the next workshop?',
    a: 'The launch Run meets Thursdays, 10 to 11:30 AM Pacific, on Zoom: January 7, 14, 21 and 28, 2027, the month Frequency launches. Anyone can join. Save your seat on the Week 1 event and the Zoom link comes to you. New Runs start through the year.',
  },
  {
    q: 'How much time does it take?',
    a: 'About three hours a week. Before Thursday, 15 minutes: a short overview and one lesson. Thursday, 90 minutes live. After, your homework: run that week’s meeting once with your own people and post a three-line report back.',
  },
  {
    q: 'I haven’t started anything yet. Is it for me?',
    a: 'Yes. It assumes you’re starting from scratch. If you run something already, you’ll fix the parts that wear you out.',
  },
  {
    q: 'What is PULSE?',
    a: 'The five-beat rhythm every Frequency gathering follows: Presence, Unite, Lead, Settle, Exhale. Every meeting in this workshop runs on it, and so does each session.',
  },
  {
    q: 'Do I need a Space?',
    a: 'No. Everything works on paper and a phone. If you have a Space, each week ends with an optional step to set it up there.',
  },
  {
    q: 'What is Business Hours?',
    a: 'A weekly hour on Zoom for Spaces on the Business plan, Wednesday mornings at 10 AM Pacific, run on PULSE in a members-only Circle. Bring one number and one stuck thing.',
  },
  {
    q: 'Is it accredited?',
    a: 'No. Certified is a certificate of completion and competency from Frequency, not an accredited certification.',
  },
]

/** The four weeks: the meeting each teaches. Mirrors BOC_WEEKS in scripts/seed-frequency-hq-boc.mts. */
const WEEKS = [
  { n: 1, name: 'The Engine', meeting: 'The weekly sit-down', length: '30 minutes, once a week', body: 'A half hour with yourself that keeps you from carrying everything at once. Only the next two weeks, three things at a time.' },
  { n: 2, name: 'The Container', meeting: 'The opening', length: 'The first 30 minutes of any gathering', body: 'Your purpose in one line, three agreements read out loud, and a check-in round. People relax when they know what will happen.' },
  { n: 3, name: 'The Gathering', meeting: 'The full gathering', length: '90 minutes, plus ten the next day', body: 'A 90-minute gathering run off one page, and a ten-minute habit the next morning to see who came back.' },
  { n: 4, name: 'The Exchange', meeting: 'The money hour', length: '45 minutes, once a month', body: 'Your break-even, one price you can say without flinching, and a monthly hour to keep both honest.' },
]

/** How each live session runs on PULSE: what happens in each beat. */
const PULSE = [
  { title: 'Presence · The idea', body: 'A story from Daniel and the one idea for the week. Nothing to do yet but arrive.' },
  { title: 'Unite · Check in and count', body: 'Say how your week went, then update your number: how many people came back.' },
  { title: 'Lead · Learn the meeting', body: 'The week’s meeting, beat by beat, with a worked example. Then you practice it with the others in the room.' },
  { title: 'Settle · Feel it', body: 'A short body practice for what the week stirs up: overwhelm, the urge to apologize, saying your price.' },
  { title: 'Exhale · Commit', body: 'One sentence said out loud to someone, and your one page for the week.' },
]

export const data: Data = {
  root: {},
  content: [
    // ── Hero: the pain in one line, the offer in the next. ────────────────────
    {
      type: 'Hero',
      props: {
        id: 'boc-hero',
        variant: 'split',
        eyebrow: 'Core training · Free',
        title: 'People showed up once. Here’s how they come back.',
        titleAccent: 'how they come back.',
        subtitle:
          'The Business of Community is Frequency’s free live workshop for anyone who gathers people. Four Thursdays on Zoom, four simple meetings you can run, all on the PULSE rhythm. Start from scratch. The launch Run starts January 7.',
        image: PHOTOS.backyard,
        focal: 'center',
        minHeight: 'auto',
        facts: [],
        ctaPrimaryLabel: START,
        ctaPrimaryHref: BOC_FUNNEL_HREF,
        ctaSecondaryLabel: 'See the first session',
        ctaSecondaryHref: CALENDAR,
        note: 'Free for anyone. Works on paper and a phone.',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The plain facts of the offer. ─────────────────────────────────────────
    {
      type: 'StatRow',
      props: {
        id: 'boc-facts',
        eyebrow: '',
        title: '',
        titleAccent: '',
        columns: '4',
        items: [
          { value: 'Free', label: 'The live workshop' },
          { value: '4', label: 'Weeks, one meeting each' },
          { value: '90 min', label: 'Live on Zoom, Thursdays' },
          { value: 'Jan 7', label: 'The launch Run starts' },
        ],
        emphasis: EMPHASIS,
        tone: 'canvas',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── 01 The pain. ──────────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-pain',
        eyebrow: 'Sound familiar?',
        title: 'Big heart. No one taught you the rest.',
        titleAccent: 'the rest.',
        style: 'icon',
        columns: '3',
        items: [
          { icon: 'Heart', image: '', title: 'You carry all of it', body: 'Booking, texting, setup, the money, the hard conversations. It all runs through you, and you’re getting tired.', href: '' },
          { icon: 'MessageCircle', image: '', title: 'The loudest guest runs the room', body: 'Nobody said the rules out loud, so the person with the most opinions made them. Quieter people stop coming back.', href: '' },
          { icon: 'Zap', image: '', title: 'People came, and you still lost money', body: 'Rent, supplies, snacks, your drive, your hours. People loved it, and you still came home behind.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 02 The one idea. ──────────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'boc-idea',
        image: PHOTOS.workshop,
        alt: 'Adults and kids making crafts around a long table in a workshop room',
        eyebrow: 'The one idea',
        title: 'Frequency. Not the sound kind. The how-often kind.',
        titleAccent: 'The how-often kind.',
        kicker: 'Count who came back, not who came.',
        body:
          "Most people who gather others count heads. How many came. How full it looked.\n\nA community lives on a different number: how many came back. A small room where people return is healthier than a big room you never see again.\n\nThat number runs through all four weeks. Each meeting you learn gives you one more way to bring people back without running yourself into the ground.",
        side: 'right',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Quote',
      props: {
        id: 'boc-quote',
        variant: 'pull',
        quote: "The question isn't how many came. It's how many came back.",
        accentWord: 'how many came back.',
        attribution: 'Daniel Tyack',
        role: 'Founder, Frequency',
        avatar: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── 03 PULSE. ─────────────────────────────────────────────────────────────
    {
      type: 'BuildTimeline',
      props: {
        id: 'boc-pulse',
        eyebrow: 'How each week runs',
        title: 'Every week runs on PULSE.',
        titleAccent: 'PULSE.',
        kicker: 'Ninety minutes live, plus a short read before.',
        intro: 'Each live session follows the same five beats. You go through the rhythm together, then you run that week’s meeting with your own people.',
        items: PULSE.map((p, i) => ({ label: p.title.charAt(0), title: p.title, body: p.body, highlight: i === 3 ? 'chosen' : 'normal' })),
        footnote: 'Settle is where the body catches up with the plan. Each week’s practice is about the one thing that week stirs up.',
        texture: 'none',
        flow: 'beat',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── 04 The four meetings. ─────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-weeks',
        eyebrow: 'The four weeks',
        title: 'Four weeks. Four meetings you can run.',
        titleAccent: 'you can run.',
        style: 'number',
        columns: '4',
        items: WEEKS.map((w) => ({ icon: 'Compass', image: '', title: `Week ${w.n}, ${w.meeting}`, body: `${w.length}. ${w.body}`, href: '' })),
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 05 Two ways in. ───────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-ways',
        eyebrow: 'Two ways in',
        title: 'Four weeks together, then every week.',
        titleAccent: 'then every week.',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'Users', image: '', title: 'The live workshop', body: 'Free for anyone. Four Thursdays on Zoom, 10 to 11:30 AM Pacific. It runs several times a year; the launch Run meets Jan 7, 14, 21 and 28. Short lessons to read before each session, then you practice each meeting with other people who gather.', href: BOC_FUNNEL_HREF },
          { icon: 'Coffee', image: '', title: 'Business Hours', body: 'For Spaces on the Business plan. Every Wednesday, 10 AM Pacific, on Zoom, run on PULSE in a members-only Circle. Bring one number and one stuck thing.', href: '/pricing' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Buttons',
      props: {
        id: 'boc-ways-links',
        items: [
          { label: START, href: BOC_FUNNEL_HREF, variant: 'primary' },
          { label: 'See the Business plan', href: '/pricing', variant: 'ghost' },
        ],
        align: 'left',
        tone: 'canvas',
        layout: { ...L, spaceTop: 'none' },
      },
    },

    // ── 06 Who it's for. ──────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-who',
        eyebrow: 'Who it’s for',
        title: 'Anyone who gathers people, or wants to.',
        titleAccent: 'or wants to.',
        style: 'icon',
        columns: '3',
        items: [
          { icon: 'Leaf', image: '', title: 'Yoga and breathwork teachers', body: 'Classes, workshops and circles you mostly run yourself.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Sound healers and ceremony holders', body: 'Sound baths and circles in studios, homes and parks.', href: '' },
          { icon: 'Users', image: '', title: 'Neighborhood and meetup hosts', body: 'The potluck, the swap, the regular night people plan their week around.', href: '' },
          { icon: 'Music', image: '', title: 'Musicians and house show hosts', body: 'The list, the room, the regulars and the newcomers.', href: '' },
          { icon: 'Star', image: '', title: 'Makers and conscious chefs', body: 'Workshops, supper clubs and craft nights around a table.', href: '' },
          { icon: 'MapPin', image: '', title: 'People who haven’t started yet', body: 'You have the heart and the idea. This is where you learn the rest.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 07 Attended or Certified. ─────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-finish',
        eyebrow: 'Two ways to finish',
        title: 'Attended or Certified. Pick the one that fits your season.',
        titleAccent: 'Certified.',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'CalendarDays', image: '', title: 'Attended', body: 'Come to all four live sessions.', href: '' },
          {
            icon: 'Shield',
            image: '',
            title: 'Certified',
            body: 'Send in your Community Book: four one-page sheets, one per meeting, filled in from real gatherings. Frequency reviews it. Review is free for Community Books submitted by February 28, 2027, then comes with the Business plan. Certified is a certificate of completion and competency from Frequency. It is not an accredited certification.',
            href: '',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 08 Questions. The Accordion emits the FAQPage node from these rows. ───
    {
      type: 'Accordion',
      props: {
        id: 'boc-faq',
        eyebrow: 'Questions',
        title: 'Good to know.',
        titleAccent: 'know.',
        items: BOC_FAQ,
        emphasis: EMPHASIS,
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Closer. ───────────────────────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'boc-cta',
        eyebrow: 'Free. Four weeks. Live on Zoom.',
        heading: 'Keep it going. Keep yourself going.',
        headingAccent: 'Keep yourself.',
        body: 'The launch Run starts January 7. Anything else, ask. A real person answers.',
        ctaPrimaryLabel: START,
        ctaPrimaryHref: BOC_FUNNEL_HREF,
        ctaSecondaryLabel: 'See the first session',
        ctaSecondaryHref: CALENDAR,
        emphasis: EMPHASIS,
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
