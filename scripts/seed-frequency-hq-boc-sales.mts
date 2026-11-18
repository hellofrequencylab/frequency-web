// THE BUSINESS OF COMMUNITY 101: THE SALES PAGE. One page on the Frequency house Space's website (Space `hq`), served at
// /spaces/hq/business-of-community. It is a Puck doc of New World blocks (components/page-editor/blocks/new-world.tsx), the
// same blocks and prop names scripts/seed-frequency-hosts.mts writes for the other hq pages. This file only builds the doc;
// scripts/seed-frequency-hosts.mts wires it into PAGES, pageDocs and the website snapshot.
//
// Course facts: scripts/seed-frequency-hq-boc.mts (four weeks, free, by Daniel Tyack). No prices, no plan names, no invented
// numbers, reviews or outcomes. Quotes are Daniel's own lines. Photos are files under public/brand/frequency/photos and
// public/sites/new-world/photos only.
//
// Block choices that matter:
// - No NewWorldFaq: it draws the Space's own live FAQ (space_faqs) when the Space has any, and hq does, so it would show the
//   house questions, not these. The questions use NewWorldPromises instead, which only ever draws its own rows.
// - No NewWorldPlans: it draws the Space's live memberships (with prices) when it has any.
// - The hero's proof and aside lines are empty on purpose: either one draws the faces strip, which reads as social proof.

type Block = { type: string; props: Record<string, unknown> }

const SLUG = 'hq'
const PAGE = (slug = '') => (slug ? `/spaces/${SLUG}/${slug}` : `/spaces/${SLUG}`)
const COURSE = '/journeys/the-business-of-community-101'
const START_CIRCLE = '/circles/creator-lab-december-start'
const CALENDAR = PAGE('calendar')
const HELP = PAGE('help')
const PLANS = '/pricing'
const SEAT = '/support'
const START = 'Start the course'
const DANIEL = 'Daniel Tyack · Founder'

const PHOTOS = {
  backyard: '/sites/new-world/photos/backyard-class.webp',
  workshop: '/sites/new-world/photos/workshop-table.webp',
}
const ALT = {
  backyard: 'A teacher leads a stretching class on mats and rugs on a sunny backyard patio',
  workshop: 'Adults and kids making crafts around a long table in a workshop room',
}

let n = 0
const id = (key: string) => `boc-${key}-${(n++).toString(36)}`
const reg = { register: 'auto' }

export const BOC_SALES_META = {
  slug: 'business-of-community',
  label: 'The Business of Community',
  seo: {
    title: 'The Business of Community 101 · Frequency',
    description: 'A free four-week course for people who already gather others. Know what a night costs you, what to charge, who came back, and who to text next week.',
  },
} as const

const WEEKS = [
  { n: 1, name: 'The Engine', idea: "Structure isn't the opposite of soul. It's what keeps the soul from burning out." },
  { n: 2, name: 'The Container', idea: "A container isn't what you believe. It's what you've written down, said out loud, and will enforce." },
  { n: 3, name: 'The Gathering', idea: "Whatever authority you don't hold, the loudest guest will." },
  { n: 4, name: 'The Exchange', idea: 'Charging is what makes your presence renewable.' },
]

export function buildBocSalesDoc(): { root: { props: Record<string, unknown> }; content: Block[] } {
  n = 0
  const content: Block[] = [
    // Hero: the pain in one line, the offer in the next.
    {
      type: 'NewWorldHero',
      props: {
        id: id('hero'),
        eyebrow: 'Free course · The Business of Community 101',
        title: 'A full room. *A night that still didn’t pay.*',
        lead: "A free four-week course for people who already gather others. Learn what a night really costs you, what to charge, who came back, and who to text next week. About an hour a week.",
        primaryLabel: START, primaryHref: COURSE,
        secondaryLabel: 'Join this month', secondaryHref: START_CIRCLE,
        proof: '',
        aside: '',
        image: PHOTOS.backyard, alt: ALT.backyard, badge: 'Free for every Space',
        useEvents: false,
        rows: [
          { weekday: 'Course', mon: 'Free', day: '1', title: 'The Business of Community 101', body: 'Four weeks, five short lessons each.', time: 'Self-paced · about an hour a week', where: 'Online', spots: 'Open', kind: 'session', href: COURSE },
          { weekday: 'Circle', mon: 'Free', day: '2', title: 'This month’s start', body: 'Start with others who began this month.', time: 'Starts each month', where: 'Online', spots: 'Open', kind: 'session', href: START_CIRCLE },
          { weekday: 'Zoom', mon: 'Tue', day: '3', title: 'Business Hours', body: 'A weekly hour for paid Spaces.', time: 'Tuesdays · 10 AM Pacific', where: 'Zoom', spots: 'Paid Spaces', kind: 'session', href: CALENDAR },
        ],
        areas: [],
        ...reg,
      },
    },

    // The plain facts of the offer. Course facts only, no outcomes.
    {
      type: 'NewWorldStats',
      props: {
        id: id('facts'),
        items: [
          { icon: 'heart', value: 'Free', label: 'for every Space', note: 'Every lesson, every week' },
          { icon: 'calendar', value: '4', label: 'weeks', note: 'One idea each' },
          { icon: 'check', value: '5', label: 'short lessons a week', note: 'Story, tools, practice, build, commit' },
          { icon: 'clock', value: '1', label: 'hour a week, about', note: 'Spreadsheet and phone are enough' },
        ],
        ...reg,
      },
    },

    // 01 The pain.
    {
      type: 'NewWorldPromises',
      props: {
        id: id('pain'), index: '01', eyebrow: 'Sound familiar?', title: 'Three ways a good room *wears you out.*',
        lede: "People love what you run. That part is working. These are the parts nobody taught you.",
        rows: [
          { icon: 'tag', title: "A full room that doesn't cover the night", body: 'Rent, gear, snacks, your drive, your hours. The room was packed and you still came home behind.' },
          { icon: 'heart', title: 'You carry all of it', body: 'Booking, texting, setup, the money, the hard conversations. It all runs through you, and nobody covers when you need a week off.' },
          { icon: 'message', title: 'The loudest guest runs the room', body: "Nobody said the rules out loud, so the person with the most opinions made them. Quieter people stop coming back." },
        ],
        ...reg,
      },
    },

    // 02 The one idea.
    {
      type: 'NewWorldLongStory',
      props: {
        id: id('idea'), index: '02', eyebrow: 'The one idea', title: 'Frequency. Not the sound kind. *The how-often kind.*',
        paragraphs: [
          "Most people who gather others count heads. How many came. How many RSVP'd. How full it looked.",
          "The question isn't how many came. It's how many came back. A small room where people return is healthier than a big room you never see again.",
          'Return frequency is the number this course is built around. Every week gives you one more way to keep people coming back without running yourself into the ground.',
        ],
        ...reg,
      },
    },
    { type: 'NewWorldQuote', props: { id: id('quote'), label: 'In Daniel’s words', quote: "The question isn't how many came. It's *how many came back.*", by: DANIEL, ...reg } },

    // 03 The four weeks.
    {
      type: 'NewWorldStory',
      props: {
        id: id('weeks'), index: '03', eyebrow: 'The four weeks', title: 'Four weeks. *One idea each.*',
        paragraphs: WEEKS.map((w) => `Week ${w.n}, ${w.name}. ${w.idea}`),
        buttonLabel: START, buttonHref: COURSE,
        secondaryLabel: 'Join this month’s start', secondaryHref: START_CIRCLE,
        image: PHOTOS.workshop, alt: ALT.workshop,
        quote: '', quoteBy: '',
        ...reg,
      },
    },

    // 04 What you leave with.
    {
      type: 'NewWorldAlways',
      props: {
        id: id('leave'), index: '04', eyebrow: 'By the end', title: 'Four things *you will know.*',
        items: ['What a gathering costs you', 'What you charge', 'Who came back', 'Who to text next week'],
        ...reg,
      },
    },

    // 05 Who it's for.
    {
      type: 'NewWorldPromises',
      props: {
        id: id('who'), index: '05', eyebrow: "Who it's for", title: 'People who *already gather.*',
        lede: 'Local creators running their thing solo or nearly, with somewhere between ten and a hundred and fifty people.',
        rows: [
          { icon: 'heart', title: 'Yoga and breathwork teachers', body: 'Classes, workshops and retreats you mostly run yourself.' },
          { icon: 'sparkle', title: 'Sound healers', body: 'Sound baths and circles in studios, homes and parks.' },
          { icon: 'users', title: 'Dance and meetup organizers', body: 'The regular night people plan their week around.' },
          { icon: 'star', title: 'Musicians and open mic hosts', body: 'The list, the room, the regulars and the newcomers.' },
          { icon: 'award', title: 'Makers', body: 'Workshops, classes and craft nights around a table.' },
          { icon: 'pin', title: 'House and small venues', body: 'A living room, a backyard or a small room that hosts others.' },
        ],
        ...reg,
      },
    },

    // 06 How each week works.
    {
      type: 'NewWorldProcess',
      props: {
        id: id('each-week'), index: '06', eyebrow: 'How each week works', title: 'Five short lessons. *About an hour.*',
        lede: 'It works on a spreadsheet and a phone. The build steps happen inside your own Space.',
        rows: [
          { icon: 'eye', title: 'The idea', body: 'A short story, stopped right at the decision. What would you do?' },
          { icon: 'check', title: 'Four tools', body: 'Plain, small tools you can use before your next gathering.' },
          { icon: 'message', title: 'Practice out loud', body: 'Say the hard sentence before you need it in the room.' },
          { icon: 'calendar', title: 'Build it on Frequency', body: 'Set it up inside your own Space, so it keeps working after the lesson.' },
          { icon: 'heart', title: 'One commitment', body: 'Write one commitment down and say it to another person.' },
        ],
        ...reg,
      },
    },

    // 07 Attended or Certified.
    {
      type: 'NewWorldFirstVisit',
      props: {
        id: id('finish'), index: '07', eyebrow: 'Two ways to finish', title: 'Attended or *Certified.*',
        lede: 'Pick the one that fits your season.',
        note: 'Certified is a certificate of completion and competency from Frequency. It is not an accredited certification.',
        rows: [
          { title: 'Attended', body: 'Finish all four weeks. That counts as 10 contact hours.' },
          { title: 'Certified', body: 'Submit your Community Book: four one-page sheets plus a 13-week season plan, and do the four builds in your own Space. Review is free through January 31, 2027, then comes with a paid Space.' },
        ],
        ...reg,
      },
    },

    // 08 What paid Spaces add.
    {
      type: 'NewWorldTools',
      props: {
        id: id('paid'), index: '08', eyebrow: 'With a paid Space', title: 'The course is free. *A paid Space adds a room.*',
        lede: 'The course works on your own. A paid Space adds a regular hour with other Space owners. Plans live on the pricing page.',
        buttonLabel: 'See plans', buttonHref: PLANS,
        secondaryLabel: 'Ask for a seat', secondaryHref: SEAT,
        note: 'Live sessions are on Zoom. Times are Pacific. Check the calendar for the next one.',
        rows: [
          { icon: 'clock', title: 'Business Hours', body: 'Every Tuesday, 10 AM Pacific, on Zoom. Bring one number and one stuck thing.' },
          { icon: 'users', title: 'The live pilot cohort', body: '8 to 12 Space owners on Zoom this December. Thursdays Dec 3, 10, 17 and Jan 7, 10:00 to 12:30 Pacific.' },
          { icon: 'check', title: 'The course stays free', body: 'Every lesson, and this month’s start, is open to every Space.' },
        ],
        ...reg,
      },
    },

    // The live course card (the Journey), as on the Creator Lab page.

    // 09 Questions. NewWorldPromises, not NewWorldFaq (see the note at the top).
    {
      type: 'NewWorldPromises',
      props: {
        id: id('faq'), index: '09', eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.',
        rows: [
          { icon: 'tag', title: 'What does it cost?', body: 'Nothing. The course and this month’s start are free for every Space. Certified review is free through January 31, 2027, then comes with a paid Space.' },
          { icon: 'clock', title: 'How much time each week?', body: 'About an hour: five short lessons. Do them in one sitting or spread them out.' },
          { icon: 'pin', title: 'Do I need a Space?', body: 'The build steps happen inside your own Space, and Certified needs the four builds done there. The rest works on a spreadsheet and a phone.' },
          { icon: 'award', title: 'Is it accredited?', body: 'No. Certified is a certificate of completion and competency from Frequency, not an accredited certification.' },
          { icon: 'calendar', title: 'What if I miss a week?', body: 'Pick it up where you left off. The lessons wait for you.' },
          { icon: 'eye', title: 'Is it live or self-paced?', body: 'Self-paced. Paid Spaces can add a live hour each week and a seat in the live pilot cohort on Zoom.' },
          { icon: 'message', title: 'What is Business Hours?', body: 'A weekly hour on Zoom for paid Spaces, Tuesdays at 10 AM Pacific. Bring one number and one stuck thing.' },
        ],
        ...reg,
      },
    },

    // Closer.
    {
      type: 'NewWorldCloser',
      props: {
        id: id('closer'),
        aside: 'Free. Four weeks. About an hour each.',
        title: 'Keep the room. *Keep yourself.*',
        primaryLabel: START, primaryHref: COURSE,
        secondaryLabel: 'Ask a question', secondaryHref: HELP,
        note: 'Want company? This month’s start is free too.',
        ...reg,
      },
    },
  ]
  return { root: { props: {} }, content }
}
