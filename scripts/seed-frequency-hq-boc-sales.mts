// THE BUSINESS OF COMMUNITY 101: THE SALES PAGE. One page on the Frequency house Space (Space `hq`), served at
// /spaces/hq/business-of-community. This file only builds the doc; scripts/seed-frequency-hosts.mts wires it into
// PAGES, pageDocs and the website snapshot.
//
// SPACE RULES (owner 2026-11-17: "The space page should follow space rules", "You have way too many styles on the
// space page"). A Space page offers only the Space palette (lib/page-editor/palette-scope.ts SURFACE_CATEGORIES.space),
// and it wears ONE style system: app/themes/frequency/space-page.css over [data-space-page], with the Space's one brand
// accent and its one font set (components/spaces/accent-scope.tsx). Theme families such as New World are website-only:
// their CSS lives in the website theme's sheet, so on the Space page they render bare. So this page is built from the
// five design blocks (PhotoHero, Zigzag, CardGrid, EditorialSection, AccentBeat; three of each at most,
// lib/page-editor/block-limits.ts), the same grammar as The Group's Fridays page. They also wear the website's theme
// when the website shows the same doc (ADR-1727, one render path).
//
// Frequency's live business workshop, sold as two ways in (owner 2026-11-17): the workshop (free, anyone, four
// 90-minute sessions on Zoom, several times a year) and Business Hours (a members-only cohort for Spaces on the Business plan).
// Facts come from scripts/seed-frequency-hq-boc.mts (BOC_WEEKS, BOC_FAQ), so this page and the workbook cannot drift.
// No prices, no invented numbers, reviews or outcomes. The FAQ is an EditorialSection, never SpaceFAQ: SpaceFAQ draws
// the Space's own live questions (space_faqs), and hq's are the house questions, not these.
import { BOC_FAQ, BOC_WEEKS } from './seed-frequency-hq-boc.mts'

type Block = { type: string; props: Record<string, unknown> }

const SLUG = 'hq'
const PAGE = (slug = '') => (slug ? `/spaces/${SLUG}/${slug}` : `/spaces/${SLUG}`)
/** The workshop's Week 1 session: "Save your seat" RSVPs on the Event (owner 2026-11-17). No self-paced course door. */
const EVENT = '/events/business-of-community-pilot-session-1'
/** The launch Run's Circle: join it to move through all four weeks together. */
const COHORT = '/circles/business-of-community-january-2027'
const BUSINESS_HOURS = '/circles/business-hours'
const HELP = PAGE('help')
const PLANS = '/pricing'
const SAVE = 'Save your seat'

// Daniel's own photos (owner 2026-11-18: "use them throughout"), the same set as the public sales page.
const PHOTOS = {
  hero: '/brand/frequency/photos/boc-circle-dusk.jpg',
  circle: '/brand/frequency/photos/boc-small-circle.jpg',
  workshop: '/brand/frequency/photos/boc-writing-cushions.jpg',
  fire: '/brand/frequency/photos/boc-fire-night.jpg',
  daniel: '/brand/frequency/photos/guide-daniel-tyack.jpg',
  feargal: '/brand/frequency/photos/guide-feargal-walsh.jpg',
}
const ALT = {
  hero: 'A circle of people sitting together outdoors at dusk',
  circle: 'A small circle sitting on cushions on an outdoor terrace',
  workshop: 'People writing on cushions on a rug in a garden',
  fire: 'Friends around a fire pit at night',
  daniel: 'Daniel Tyack',
  feargal: 'Feargal Walsh',
}

/** The workshop's Thursdays, in order (scripts/seed-frequency-hq-circles.mts WORKSHOP_WEEKS). */
const DATES = ['Jan 7', 'Jan 14', 'Jan 21', 'Jan 28']

let n = 0
const id = (key: string) => `boc-${key}-${(n++).toString(36)}`

export const BOC_SALES_META = {
  slug: 'business-of-community',
  label: 'The Business of Community',
  seo: {
    title: 'The Business of Community 101 · Frequency',
    description: 'Frequency’s free four-week live business workshop for anyone who gathers people. Four simple meetings on the PULSE rhythm, live on Zoom. Starts January 7, 2027.',
  },
} as const

export function buildBocSalesDoc(): { root: { props: Record<string, unknown> }; content: Block[] } {
  n = 0
  const content: Block[] = [
    // The opener: the pain in one line, the offer in the next.
    {
      type: 'PhotoHero',
      props: {
        id: id('hero'),
        variant: 'image', display: 'beside', height: 'medium', scrim: 'light',
        image: PHOTOS.hero, alt: ALT.hero,
        eyebrow: 'Live workshop · Free',
        title: 'People showed up once. Here’s how they come back.',
        accentWord: 'Here’s how they come back.',
        subtitle: 'The Business of Community is Frequency’s free four-week live workshop for anyone who gathers people. Four simple meetings you can run, all on the PULSE rhythm. It assumes you’re starting from scratch.',
        actionPrimaryLabel: SAVE, actionPrimaryHref: EVENT,
        actionSecondaryLabel: 'Join the January Run', actionSecondaryHref: COHORT,
        note: 'Thursdays, January 7 to 28 · 10 to 11:30 AM Pacific · on Zoom',
      },
    },

    // The one idea.
    {
      type: 'Zigzag',
      props: {
        id: id('idea'),
        image: PHOTOS.circle, alt: ALT.circle, mediaSide: 'right', background: 'canvas',
        eyebrow: 'The one idea',
        title: 'Frequency. The how-often kind.',
        accentWord: 'The how-often kind.',
        body: 'lead',
        lead: 'Most people who gather others count heads. How many came. How full it looked.<br><br>A community lives on a different number: how many came back. A small room where people return is healthier than a big room you never see again. That number runs through all four weeks.',
        items: [], quoteBy: '', ctaLabel: '', ctaHref: '',
      },
    },

    // The four meetings, one a week, with the dates.
    {
      type: 'CardGrid',
      props: {
        id: id('weeks'),
        role: 'step', columns: 2,
        eyebrow: 'The four weeks',
        title: 'Four meetings you can run.',
        accentWord: 'you can run.',
        cards: BOC_WEEKS.map((w, i) => ({ title: `${DATES[i]} · ${w.meeting}`, body: w.leaveWith })),
        browseLabel: '', browseHref: '',
      },
    },

    // How a week works: before, live, after.
    {
      type: 'Zigzag',
      props: {
        id: id('week'),
        image: PHOTOS.workshop, alt: ALT.workshop, mediaSide: 'left', background: 'accent-wash',
        eyebrow: 'How each week works',
        title: 'Read it. Practice it. Run it.',
        accentWord: 'Run it.',
        body: 'list',
        lead: '',
        items: [
          { text: 'Before Thursday, about 15 minutes: a short overview and one lesson.' },
          { text: 'Thursday, 90 minutes live on Zoom, on PULSE: a story, check-ins in small groups, the meeting and a practice run, a moment to steady, and one commitment said out loud.' },
          { text: 'After: run the meeting once with your own people, fill in your one page, and post a three-line report back to your Run.' },
        ],
        quoteBy: '', ctaLabel: SAVE, ctaHref: EVENT,
      },
    },

    // The guides.
    {
      type: 'CardGrid',
      props: {
        id: id('guides'),
        role: 'media', columns: 2,
        eyebrow: 'Your guides',
        title: 'Hosted by Frequency. Led by Daniel and Feargal.',
        accentWord: 'Led by Daniel and Feargal.',
        cards: [
          { image: PHOTOS.daniel, alt: ALT.daniel, title: 'Daniel Tyack', body: 'Founder and Architect of Frequency. Daniel has spent years building and leading rooms, from music to men’s work to ceremony, and created PULSE, the rhythm the workshop runs on.' },
          { image: PHOTOS.feargal, alt: ALT.feargal, title: 'Feargal Walsh', body: 'Experience and Technology at Frequency. Feargal turns the systems organizers need into tools that are simple to run week after week.' },
        ],
        browseLabel: '', browseHref: '',
      },
    },

    // Two ways in.
    {
      type: 'CardGrid',
      props: {
        id: id('ways'),
        role: 'feature', columns: 2,
        eyebrow: 'Two ways in',
        title: 'Four weeks together, then every week.',
        accentWord: 'then every week.',
        cards: [
          { icon: '◎', title: 'The live workshop', body: 'Free for anyone, Space or not. Four Thursdays on Zoom, 10 to 11:30 AM Pacific. It runs several times a year; the launch Run meets January 7 to 28.', button: { label: SAVE, href: EVENT } },
          { icon: '↗', title: 'Business Hours', body: 'For Spaces on the Business plan. Wednesday mornings at 10 AM Pacific on Zoom, run on PULSE in a members-only Circle. Bring one number and one stuck thing.', button: { label: 'See the Circle', href: BUSINESS_HOURS } },
        ],
        browseLabel: 'See the Business plan', browseHref: PLANS,
      },
    },

    // Attended or Certified.
    {
      type: 'Zigzag',
      props: {
        id: id('finish'),
        image: PHOTOS.fire, alt: ALT.fire, mediaSide: 'right', background: 'canvas',
        eyebrow: 'Two ways to finish',
        title: 'Attended or Certified.',
        accentWord: 'Certified.',
        body: 'list',
        lead: '',
        items: [
          { text: 'Attended: come to all four live sessions.' },
          { text: 'Certified: send in your Community Book, your four pages filled in from real gatherings. Review is free for Community Books submitted by February 28, 2027, then comes with the Business plan.' },
          { text: 'Certified is a certificate of completion and competency from Frequency. It is not an accredited certification.' },
        ],
        quoteBy: '', ctaLabel: '', ctaHref: '',
      },
    },

    // Questions.
    {
      type: 'EditorialSection',
      props: {
        id: id('faq'),
        eyebrow: 'Questions',
        title: 'Good to know.',
        accentWord: 'know.',
        kicker: 'Anything else, ask. A person on the Frequency team answers.',
        body: 'faq', surface: 'open', lead: '', stats: [],
        faqs: BOC_FAQ.map((f) => ({ q: f.q, a: f.a })),
      },
    },

    // The close.
    {
      type: 'AccentBeat',
      props: {
        id: id('closer'),
        mode: 'cta', background: 'accent-wash', image: '', alt: '',
        eyebrow: 'Free · Four weeks · Live on Zoom',
        title: 'Keep the room. Keep yourself.',
        accentWord: 'Keep yourself.',
        body: 'The launch Run starts Thursday, January 7.',
        quoteBy: '',
        ctaLabel: SAVE, ctaHref: EVENT,
        ctaSecondaryLabel: 'Ask a question', ctaSecondaryHref: HELP,
      },
    },
  ]
  return { root: { props: {} }, content }
}
