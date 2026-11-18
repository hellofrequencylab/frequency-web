import type { Data } from '@/lib/page-editor/types'

// ─────────────────────────────────────────────────────────────────────────────
// THE BUSINESS OF COMMUNITY 101: the course sales page at /courses/business-of-community, expressed in
// the standard marketing blocks (the template IS the page, like the-lab.ts). An EDITABLE_PAGES slug, so
// Daniel can change these words in the page editor; a published document wins, this file is the last rung.
//
// SOURCE. The copy, section order and photos come from the house Space's sales page doc
// (scripts/seed-frequency-hq-boc-sales.mts, buildBocSalesDoc), rebuilt here from the marketing kit blocks
// instead of the New World Space-website blocks. Three deliberate deltas from that doc:
//   · The monthly start Circle is named only in the owner's cost answer, never linked: it is a member
//     route, and this page is public.
//   · Every "Start the course" goes to the Funnel (BOC_FUNNEL_HREF), which signs a visitor up and lands
//     them in the course. The public Journey page is the secondary door.
//   · The questions are an Accordion, so the FAQPage node comes from the questions a visitor can read.
//
// HONESTY CONTRACT (docs/CONTENT-VOICE.md). Course facts only: free, four weeks, five short lessons a
// week, about an hour. No prices, no plan names (a paid Space links /pricing), no testimonials, no
// outcomes, no invented numbers. Certified is a certificate of completion and competency, not an
// accredited certification. Certified review is free through January 31, 2027, then comes with a paid Space
// (owner decision 2026-11-17). The date is literal copy because this is an editable template; it is
// BETA_ENDS_ON in lib/core/launch-dates.ts, so move both together.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const
const EMPHASIS = { scale: 'default', accent: 'none' } as const

/** The DB-built Funnel for this course (scripts/seed-boc-funnel.sql). Completion lands in the course. */
const BOC_FUNNEL_HREF = '/join?seq=business-of-community'
/** The course's public, canonical Journey page. */
export const BOC_JOURNEY_PATH = '/discover/journeys/the-business-of-community-101'
const START = 'Start the course'

const PHOTOS = {
  backyard: '/sites/new-world/photos/backyard-class.webp',
  workshop: '/sites/new-world/photos/workshop-table.webp',
}

/** The questions, shared with the llms-full corpus so the two say the same thing. */
export const BOC_FAQ: { q: string; a: string }[] = [
  {
    q: 'What does it cost?',
    a: 'Nothing. The course and this month’s start are free for every Space. Certified review is free through January 31, 2027, then comes with a paid Space.',
  },
  {
    q: 'How much time does it take each week?',
    a: 'About an hour: five short lessons. Do them in one sitting or spread them across the week.',
  },
  {
    q: 'Do I need a Space?',
    a: 'The build steps happen inside your own Space, and Certified needs the four builds done there. The rest works on a spreadsheet and a phone.',
  },
  {
    q: 'Is it accredited?',
    a: 'No. Certified is a certificate of completion and competency from Frequency, not an accredited certification.',
  },
  {
    q: 'What if I miss a week?',
    a: 'Pick it up where you left off. The lessons wait for you.',
  },
  {
    q: 'Is it live or self-paced?',
    a: 'Self-paced. A paid Space adds a live hour each week, Business Hours, and you can ask for a seat in the December live pilot on Zoom.',
  },
  {
    q: 'What is Business Hours?',
    a: 'A weekly hour on Zoom for paid Spaces, Tuesdays at 10 AM Pacific. Bring one number and one stuck thing.',
  },
]

const WEEKS = [
  { n: 1, name: 'The Engine', idea: "Structure isn't the opposite of soul. It's what keeps the soul from burning out." },
  { n: 2, name: 'The Container', idea: "A container isn't what you believe. It's what you've written down, said out loud, and will enforce." },
  { n: 3, name: 'The Gathering', idea: "Whatever authority you don't hold, the loudest guest will." },
  { n: 4, name: 'The Exchange', idea: 'Charging is what makes your presence renewable.' },
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
        eyebrow: 'Free course · The Business of Community 101',
        title: 'A full room. A night that still didn’t pay.',
        titleAccent: 'A night that still didn’t pay.',
        subtitle:
          'A free four-week course for people who already gather others. Learn what a night really costs you, what to charge, who came back, and who to text next week. About an hour a week.',
        image: PHOTOS.backyard,
        focal: 'center',
        minHeight: 'auto',
        facts: [],
        ctaPrimaryLabel: START,
        ctaPrimaryHref: BOC_FUNNEL_HREF,
        ctaSecondaryLabel: 'See every lesson',
        ctaSecondaryHref: BOC_JOURNEY_PATH,
        note: 'Free. Self-paced. Works on a spreadsheet and a phone.',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The plain facts of the offer. Course facts only, no outcomes. ─────────
    {
      type: 'StatRow',
      props: {
        id: 'boc-facts',
        eyebrow: '',
        title: '',
        titleAccent: '',
        columns: '4',
        items: [
          { value: 'Free', label: 'Every lesson, every week' },
          { value: '4', label: 'Weeks, one idea each' },
          { value: '5', label: 'Short lessons a week' },
          { value: '1 hour', label: 'A week, about' },
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
        title: 'Three ways a good room wears you out.',
        titleAccent: 'wears you out.',
        style: 'icon',
        columns: '3',
        items: [
          { icon: 'Zap', image: '', title: 'A full room that doesn’t cover the night', body: 'Rent, gear, snacks, your drive, your hours. The room was packed and you still came home behind.', href: '' },
          { icon: 'Heart', image: '', title: 'You carry all of it', body: 'Booking, texting, setup, the money, the hard conversations. It all runs through you, and nobody covers when you need a week off.', href: '' },
          { icon: 'MessageCircle', image: '', title: 'The loudest guest runs the room', body: 'Nobody said the rules out loud, so the person with the most opinions made them. Quieter people stop coming back.', href: '' },
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
        kicker: 'People love what you run. That part is working.',
        body:
          "Most people who gather others count heads. How many came. How many RSVP'd. How full it looked.\n\nThe question isn't how many came. It's how many came back. A small room where people return is healthier than a big room you never see again.\n\nReturn frequency is the number this course is built around. Every week gives you one more way to keep people coming back without running yourself into the ground.",
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

    // ── 03 The four weeks. ────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-weeks',
        eyebrow: 'The four weeks',
        title: 'Four weeks. One idea each.',
        titleAccent: 'One idea each.',
        style: 'number',
        columns: '4',
        items: WEEKS.map((w) => ({ icon: 'Compass', image: '', title: `Week ${w.n}, ${w.name}`, body: w.idea, href: '' })),
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 04 What you leave with. ───────────────────────────────────────────────
    {
      type: 'Checklist',
      props: {
        id: 'boc-leave',
        title: 'By the end, four things you will know.',
        titleAccent: 'you will know.',
        columns: '2',
        items: [
          { text: 'What a gathering costs you' },
          { text: 'What you charge' },
          { text: 'Who came back' },
          { text: 'Who to text next week' },
        ],
        emphasis: EMPHASIS,
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 05 Who it's for. ──────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-who',
        eyebrow: 'Who it’s for',
        title: 'People who already gather.',
        titleAccent: 'already gather.',
        style: 'icon',
        columns: '3',
        items: [
          { icon: 'Leaf', image: '', title: 'Yoga and breathwork teachers', body: 'Classes, workshops and retreats you mostly run yourself.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Sound healers', body: 'Sound baths and circles in studios, homes and parks.', href: '' },
          { icon: 'Users', image: '', title: 'Dance and meetup organizers', body: 'The regular night people plan their week around.', href: '' },
          { icon: 'Music', image: '', title: 'Musicians and open mic hosts', body: 'The list, the room, the regulars and the newcomers.', href: '' },
          { icon: 'Star', image: '', title: 'Makers', body: 'Workshops, classes and craft nights around a table.', href: '' },
          { icon: 'MapPin', image: '', title: 'House and small venues', body: 'A living room, a backyard or a small room that hosts others.', href: '' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 06 How each week works. ───────────────────────────────────────────────
    {
      type: 'BuildTimeline',
      props: {
        id: 'boc-each-week',
        eyebrow: 'How each week works',
        title: 'Five short lessons. About an hour.',
        titleAccent: 'About an hour.',
        kicker: 'It works on a spreadsheet and a phone.',
        intro: 'The build steps happen inside your own Space, so what you set up keeps working after the lesson.',
        items: [
          { label: '1', title: 'The idea', body: 'A short story, stopped right at the decision. What would you do?', highlight: 'normal' },
          { label: '2', title: 'Four tools', body: 'Plain, small tools you can use before your next gathering.', highlight: 'normal' },
          { label: '3', title: 'Practice out loud', body: 'Say the hard sentence before you need it in the room.', highlight: 'normal' },
          { label: '4', title: 'Build it on Frequency', body: 'Set it up inside your own Space, so it keeps working after the lesson.', highlight: 'normal' },
          { label: '5', title: 'One commitment', body: 'Write one commitment down and say it to another person.', highlight: 'chosen' },
        ],
        footnote: '',
        texture: 'none',
        flow: 'beat',
        tone: 'surface',
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
          { icon: 'CalendarDays', image: '', title: 'Attended', body: 'Finish all four weeks. That counts as 10 contact hours.', href: '' },
          {
            icon: 'Shield',
            image: '',
            title: 'Certified',
            body: 'Submit your Community Book: four one-page sheets plus a 13-week season plan. Then do the four builds in your own Space. Certified review is free through January 31, 2027, then comes with a paid Space. Certified is a certificate of completion and competency from Frequency. It is not an accredited certification.',
            href: '',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── 08 What a paid Space adds. No prices, no plan names: /pricing. ────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'boc-paid',
        eyebrow: 'With a paid Space',
        title: 'The course is free. A paid Space adds a room.',
        titleAccent: 'adds a room.',
        style: 'icon',
        columns: '3',
        items: [
          { icon: 'Coffee', image: '', title: 'Business Hours', body: 'Every Tuesday, 10 AM Pacific, on Zoom. Bring one number and one stuck thing.', href: '' },
          { icon: 'Users', image: '', title: 'The December live pilot', body: '8 to 12 Space owners, live on Zoom. Thursdays Dec 3, 10, 17 and Jan 7, 10:00 to 12:30 Pacific. Ask for a seat.', href: '/support' },
          { icon: 'Heart', image: '', title: 'The course stays free', body: 'Every lesson is open whether your Space is free or paid. The live hour is the extra.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Buttons',
      props: {
        id: 'boc-paid-links',
        items: [
          { label: 'See plans', href: '/pricing', variant: 'secondary' },
          { label: 'Ask for a seat', href: '/support', variant: 'ghost' },
        ],
        align: 'left',
        tone: 'surface',
        layout: { ...L, spaceTop: 'none' },
      },
    },

    // ── 09 Questions. The Accordion emits the FAQPage node from these rows. ───
    {
      type: 'Accordion',
      props: {
        id: 'boc-faq',
        eyebrow: 'Questions',
        title: 'Good to know.',
        titleAccent: 'know.',
        items: BOC_FAQ,
        emphasis: EMPHASIS,
        tone: 'canvas',
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
        eyebrow: 'Free. Four weeks. About an hour each.',
        heading: 'Keep the room. Keep yourself.',
        headingAccent: 'Keep yourself.',
        body: 'Start this week. Anything else, ask. A real person answers.',
        ctaPrimaryLabel: START,
        ctaPrimaryHref: BOC_FUNNEL_HREF,
        ctaSecondaryLabel: 'Ask a question',
        ctaSecondaryHref: '/help',
        emphasis: EMPHASIS,
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
