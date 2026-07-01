import type { Data } from '@measured/puck'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// SPACES — "call in the community builders". For the organizer who already
// gathers people, or wants to, and wants to run THEIR OWN community on
// Frequency's rails. The owner's brief, answered most directly: "Call in all the
// community builders. This is a space where we can all exist together and support
// each other." The promise that does the heavy lifting: you bring your people,
// and your people join free. We never charge the people who walk through your
// door. We only ask the builder to cover the room.
//
// HOW THIS FILE IS BUILT (copies the-community.ts shape + section rhythm):
//  • One `const L` layout literal reused on every block (`...L` or inline) so the
//    spacing rhythm is consistent. Override per block only with intent.
//  • Section rhythm = an alternating beat of tones (surface → canvas → surface …),
//    a `Statement` interstitial between movements, exactly ONE dark `ink` beat near
//    the end, then the ink close.
//  • Storyline: who it's for (you already gather people, or want to) → what you get
//    (the format, the tools, Circles, Runs, events, your people join free) → how it
//    works (the simple deal + three steps) → the welcome (you're not building alone;
//    we hand you the rails and the backup).
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    verbatim (Circle, Channel, Pillar, Journey, Run; Member → Crew → Host → Guide →
//    Mentor). No em dashes. Sentence-case headings. Contractions always.
//  • Honest at day zero: no invented member counts, no logos, no fake numbers.
//  • Pricing stays a simple "what it costs and what your members get", NOT the full
//    table. The full table lives on /pricing; this page links there as the quiet
//    secondary door.
//  • CTA SYSTEM: the primary action is BETA_CTA_LABEL ("Start a Circle") and appears
//    at THREE moments — the hero, a mid-page CallToAction after the how-it-works
//    steps (highest intent), and the ink close. Each primary carries ONE quiet
//    secondary text link (BETA_CTA_SECONDARY_*). Never stack two buttons; a secondary
//    text link is not a button. The hero's `note` carries honest founding status.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the summons. The builder, not the party-goer, is the reader. Image
    // is a real hosted gathering under a shade tent. One primary door (Start a
    // Circle) and one quiet secondary link for the not-yet-ready Seeker. ──────────
    {
      type: 'Hero',
      props: {
        id: 'sp-hero',
        variant: 'image',
        eyebrow: 'Spaces',
        title: 'Bring your people. They join free. You hold the room.',
        titleAccent: 'They join free',
        subtitle:
          "If you already gather people, or you've been meaning to, this is where you run your own community on rails that work. Your people join free. You cover the room, and we hand you the format and the backup.",
        image: '/images/site/outdoor-group.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL,
        ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        note: "We're just opening. The first builders set the tone.",
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── Name the reader ── who this is for, said plainly. The builder narrative as
    // CONTENT, never a gate: you don't apply, you start. ─────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'sp-reader-h',
        eyebrow: 'Who this is for',
        title: 'For the people who gather people.',
        titleAccent: 'gather people',
        kicker: "You already do this, or you've felt the pull. You just want rails under it.",
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'sp-reader-b',
        body: "Maybe you teach a class, run a studio, hold a weekly walk, or keep a table that the same faces find every week. Maybe you've tried to start something and it fizzled. Either way, you're the one who shows up early and sets out the chairs.\n\nFrequency is for you. You don't have to build a community from scratch, and you don't have to do it alone. Bring the people you already have, or the few you want to call in, and we hand you a format, the tools, and a hand on your shoulder. This is a place where builders exist together and back each other up.",
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'none', spaceBottom: 'default', visibility: 'all' },
      },
    },
    {
      type: 'Statement',
      props: {
        id: 'sp-stmt-1',
        text: "You run the room. We never put a turnstile in front of your people.",
        accent: 'turnstile',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Who claims a Space: the four doors. Same builder, four starting points. ───
    {
      type: 'FeatureGrid',
      props: {
        id: 'sp-doors',
        eyebrow: 'Where builders come from',
        title: 'Four ways in.',
        titleAccent: 'Four',
        style: 'icon',
        columns: '2',
        items: [
          {
            icon: 'Leaf',
            image: '',
            title: 'Practitioners',
            body: 'You teach, coach, or hold a regular practice. Bring your class and keep it free for the people who come.',
            href: '',
          },
          {
            icon: 'Heart',
            image: '',
            title: 'Nonprofits',
            body: "You already gather people around a cause. Give them a home where nobody hits a paywall to belong.",
            href: '',
          },
          {
            icon: 'Coffee',
            image: '',
            title: 'Businesses',
            body: "You've got a studio, a cafe, or a room and a crowd of regulars. Turn them into people who belong somewhere.",
            href: '',
          },
          {
            icon: 'Handshake',
            image: '',
            title: 'Partners',
            body: 'You want to build with us directly. We set those up by hand, room by room.',
            href: '',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── What you get ── the format, the tools, on canon. Channels find your people;
    // a Circle running a Journey together is a Run; gatherings become Events. ─────
    {
      type: 'MediaText',
      props: {
        id: 'sp-get',
        image: '/images/site/hula-hoop-beach.jpg',
        alt: 'A woman hula-hooping on the beach',
        eyebrow: 'What you get',
        title: "Your group, on rails that already work.",
        titleAccent: 'already work',
        kicker: "You don't start over. You move in.",
        body: "A Channel ties you to the people near you who care about the same thing, so the ones looking for what you do can actually find you. Your weekly group becomes a Run, your Circle walking a Journey together with a standing time and the same faces. Your gatherings become Events on a calendar people show up to.\n\nThe format, the script, and the backup come with it. You set out the chairs. We hand you the structure so the room runs itself, and your people keep showing up.",
        side: 'left',
        imgAspect: 'portrait',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Get found, get booked ── the practitioner's own toolkit, shown as one flow
    // from the house illustration kit (the LeadFunnel block). This is about the
    // builder's paid work, not the free community: how a new person finds your
    // Spotlight page and turns into a booked session you can track. Grouped with the
    // surface "what you get" beat above; full width so the five steps breathe. ────
    {
      type: 'LeadFunnel',
      props: {
        id: 'sp-lead-funnel',
        eyebrow: 'Get found, get booked',
        title: 'Turn your Spotlight page into booked sessions.',
        titleAccent: 'booked sessions',
        orientation: 'horizontal',
        showNumbers: true,
        steps: [
          { illustration: 'spotlight', label: 'Your Spotlight page', caption: 'Someone finds you and taps a link.' },
          { illustration: 'book', label: 'They book online', caption: 'They pick a time. No back-and-forth.' },
          { illustration: 'capture', label: 'Saved to your CRM', caption: 'The contact lands in your list.' },
          { illustration: 'nurture', label: 'Follow-up runs itself', caption: 'A friendly sequence goes out on time.' },
          { illustration: 'pipeline', label: 'Into your pipeline', caption: 'You watch each lead move toward booked.' },
        ],
        footnote:
          'Found on your Spotlight page, booked online, saved to your CRM, followed up automatically, and tracked to booked.',
        tone: 'surface',
        width: 'full',
        align: 'center',
        layout: { spaceTop: 'none', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── How it works ── the simple deal said plainly: members free, you cover the
    // room. NOT the full table; /pricing is the quiet door. ──────────────────────
    {
      type: 'Heading',
      props: {
        id: 'sp-deal-h',
        eyebrow: 'How it works',
        title: 'We never charge your people.',
        titleAccent: 'never',
        kicker: 'One line for the people you bring. One line for you.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'sp-deal-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '2',
        items: [
          {
            icon: '',
            image: '',
            title: 'Your people: free',
            body: 'Everyone you bring joins as a Member at no cost. Browse, show up, earn Zaps, meet Vera. No card, no paywall, no catch.',
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'You: cover the room',
            body: 'You pay a flat plan to run your room and its tools. Plans start free and grow with you, from a solo practitioner to a full team.',
            href: '',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'sm', spaceBottom: 'default', visibility: 'all' },
      },
    },
    {
      type: 'Text',
      props: {
        id: 'sp-deal-note',
        body: "That's the whole shape of it. Plans run from a free listing to larger team tiers, each at a flat monthly price with a small cut only on what you sell. The full breakdown lives on the [pricing page](/pricing). Billing isn't turned on yet, so nothing charges today.",
        size: 'base',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Three steps ── make "claim a Space" concrete. The builder leaves knowing
    // exactly what to do. "We hand you the format" lives inside step three. ──────
    {
      type: 'FeatureGrid',
      props: {
        id: 'sp-how-steps',
        eyebrow: 'How you start',
        title: "Three steps and your room is open.",
        titleAccent: 'your room is open',
        style: 'number',
        columns: '3',
        items: [
          { icon: 'Compass', image: '', title: 'Pick what you gather around', body: "A class, a walk, a supper table, a sit. That's your Channel.", href: '' },
          { icon: 'Users', image: '', title: 'Bring your people', body: "The regulars you have, or a few you want to call in. That's your Circle.", href: '' },
          { icon: 'CalendarDays', image: '', title: 'Hold the door, same time each week', body: 'We hand you the format, the script, and the backup.', href: '' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Mid-page CTA ── the highest-intent moment: they've seen what they get, the
    // deal, and the three steps. Ask here, not just at the bottom. Not ink (the
    // single dark beat is the welcome, below). ──────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'sp-cta-mid',
        eyebrow: '',
        heading: 'Open your room.',
        headingAccent: 'your room',
        body: "You've seen what you get, the deal, and the three steps. The first builders are setting the tone now.",
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL,
        ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── The safety net ── the welcome that answers the builder's real fear. Member →
    // Crew → Host → Guide → Mentor, with "you're never out front alone". ─────────
    {
      type: 'RolesPath',
      props: {
        id: 'sp-roles',
        eyebrow: 'You are not building alone',
        title: 'You are never out front alone.',
        titleAccent: 'never',
        kicker: 'Step up as far as you want. Every rung has the one above it for backup.',
        rungs: [
          { name: 'Member', blurb: "Your people show up to a Circle. That's the whole entry fee." },
          { name: 'Crew', blurb: "They're in for the season, learning the format and lending a hand." },
          { name: 'Host', blurb: 'You hold a Circle through a Run. The script and the backup come with it.' },
          { name: 'Guide', blurb: 'You look after the Hosts nearby, so no one runs a room alone.' },
          { name: 'Mentor', blurb: 'You keep the Guides steady across a whole local community.' },
        ],
        safetyNet:
          'Nobody gets handed a room and left to sink. Whatever rung you take, the rung above it is there for backup: a Guide for every Host, a Mentor for every Guide. Step up exactly as far as feels right, and step back any time.',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    {
      type: 'Statement',
      props: {
        id: 'sp-stmt-2',
        text: 'Access, not extraction. We keep the door open instead of standing in it.',
        accent: 'extraction',
        tone: 'surface',
        layout: L,
      },
    },

    // ── The single dark beat ── why we run it this way. Exactly one ink section,
    // near the end, before the ink close. Atmospheric sunset image. ─────────────
    {
      type: 'MediaText',
      props: {
        id: 'sp-why',
        image: '/images/site/sunset.jpg',
        alt: 'A wide open sky at sunset over the coast',
        eyebrow: 'Why we do it this way',
        title: 'The room belongs to the people in it.',
        titleAccent: 'people in it',
        kicker: '',
        body: "A community that taxes its own members slowly stops being a community. We've all watched it happen. So Frequency keeps membership free and asks the builders who run the rooms to cover the rooms.\n\nThat keeps the math honest. Your people belong because they show up, not because they paid at the door. And when you grow, the rails grow with you, never against you.",
        side: 'right',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'ink',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Marquee',
      props: {
        id: 'sp-marquee',
        items: [
          { text: 'Bring your people' },
          { text: 'They join free' },
          { text: 'Cover the room, not the people' },
          { text: 'Run one Circle' },
          { text: "You're never out front alone" },
          { text: 'Keep your group' },
        ],
        layout: L,
      },
    },

    // ── Close ── the ink CTA. Primary action plus the quiet member path. ─────────
    {
      type: 'CallToAction',
      props: {
        id: 'sp-cta',
        eyebrow: '',
        heading: 'Call in your people.',
        headingAccent: 'your people',
        body: "Bring the people you have, or the few you want to gather, and keep it free for every one of them. Start a Circle and we'll set your room up with you.",
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL,
        ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
