import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// SPACES — regenerated onto the DAWN 2 block set (UX-MATURITY-PLAN Lift 5b),
// matching about.ts and the-lab.ts: one shared `L` layout literal, the DAWN bands
// carrying the spine (Hero with the glass fact dock, StoryBeats on the reading
// measure, the ink ValueBand, the numbered BuildTimeline), with the product-story
// blocks kept where they are the truer expression (LeadFunnel draws the booking
// flow, RolesPath draws the Member → Mentor ladder; no generic band draws either).
// The DAWN operator reference (design_handoff/dawn/ui_kits/marketing/operators.html)
// is the visual model: a numbered three-step row on the cream schematic, then the
// capability set on ink, then the deal.
//
// "Call in the community builders." For the organizer who already gathers people,
// or wants to, and wants to run THEIR OWN community on Frequency's rails. The
// promise that does the heavy lifting: you bring your people, and your people join
// free. We never charge the people who walk through your door. We only ask the
// builder to cover the room.
//
// COPY PROVENANCE (owner rule: default to what's on the site already). Every
// sentence is lifted verbatim from something already published:
//  • the live template this replaces (the render path for /spaces today), and
//  • the coded body in app/(marketing)/spaces/page.tsx, from which TWO sections
//    are RECOVERED because the live page had quietly dropped them:
//      1. "What a Space gets" — the six things a room needs, now on the DAWN ink
//         principles band (the operators.html capability band).
//      2. "Guides for builders" — the Labs-track SEO cluster cross-links. Losing
//         them cost /spaces its role as the hub of that internal-link graph. The
//         fourth card's href is corrected to /host-a-recurring-gathering (the
//         coded body pointed two cards at the same guide).
//    Plus the coded "who this is for" prose, as the second ruled story beat.
//
// HERO FACT DOCK: the three figures are the page's own, not new claims. 0% on your
// own bookings and "your people join free" are stated in the bands below; the "no
// card" line is the same honest founding status the hero note already carried.
//
// CANON + VOICE:
//  • Canon terms verbatim (Circle, Channel, Pillar, Journey, Run; Member → Crew →
//    Host → Guide → Mentor). No em dashes. Sentence-case headings. Contractions.
//  • Honest at day zero: no invented member counts, no logos, no fake numbers.
//  • Pricing stays a simple "what it costs and what your members get", NOT the full
//    table. The full table lives on /pricing; this page links there as the quiet
//    secondary door.
//  • Rhythm: an alternating light beat with a `Statement` interstitial between
//    movements, TWO dark beats (the ink capability band, the ink "why we do it this
//    way"), the slat Marquee, then the ink close.
//  • CTA SYSTEM: the primary action is BETA_CTA_LABEL ("Start a Circle") and appears
//    at THREE moments — the hero, a mid-page CallToAction after the how-it-works
//    steps (highest intent), and the ink close. Each primary carries ONE quiet
//    secondary text link (BETA_CTA_SECONDARY_*). Never stack two buttons.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the summons. The builder, not the party-goer, is the reader. Image
    // is a real hosted gathering under a shade tent. One primary door (Start a
    // Circle) and one quiet secondary link for the not-yet-ready Seeker. The DAWN
    // fact dock hangs the deal over the seam. ───────────────────────────────────
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
        minHeight: 'auto',
        facts: [
          { value: '0%', label: 'On your own bookings' },
          { value: 'Free', label: 'For everyone you bring' },
          { value: 'No card', label: 'To open your room' },
        ],
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

    // ── Name the reader ── who this is for, said plainly, as ruled prose on the
    // reading measure. The builder narrative as CONTENT, never a gate: you don't
    // apply, you start. Beat two is the coded page's own framing of the same
    // reader, kept because it names the job the rest of the page answers. ───────
    {
      type: 'StoryBeats',
      props: {
        id: 'sp-reader',
        eyebrow: 'Who this is for',
        kicker: "You already do this, or you've felt the pull. You just want rails under it.",
        items: [
          {
            title: 'For the people who gather people.',
            body: "Maybe you teach a class, run a studio, hold a weekly walk, or keep a table that the same faces find every week. Maybe you've tried to start something and it fizzled. Either way, you're the one who shows up early and sets out the chairs.\n\nFrequency is for you. You don't have to build a community from scratch, and you don't have to do it alone. Bring the people you already have, or the few you want to call in, and we hand you a format, the tools, and a hand on your shoulder. This is a place where builders exist together and back each other up.",
          },
          {
            title: 'The practitioners who already do the work.',
            body: 'You are already the reason a few people have somewhere to go. The hard part is the rest: a front door so new people find you, a format so a group lasts, and a way to grow without losing what made it yours.\n\nA Space is your community on Frequency. Your Channels, your Circles, your Runs, inside a structure built to last and a network of neighbors looking for exactly what you do.',
          },
        ],
        flow: 'cont',
        tone: 'canvas',
        layout: L,
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

    // ── What a Space gets ── RECOVERED from the coded body, on the DAWN ink
    // principles band with the sheen pass (the operators.html capability band).
    // The page's first dark beat: the six things a room needs to last. ──────────
    {
      type: 'ValueBand',
      props: {
        id: 'sp-inside',
        eyebrow: 'What a Space gets',
        title: 'Everything a room needs to last.',
        titleAccent: 'last',
        kicker: 'The front door, the format, and the backup, in one place.',
        columns: '3',
        items: [
          {
            icon: 'DoorOpen',
            title: 'A real front door',
            body: 'Your Space gets a page in Discover, so the people looking for what you do can actually find you.',
          },
          {
            icon: 'Compass',
            title: 'Channels that connect',
            body: 'List what you practice as Channels, and the neighbors who care about the same thing land in your room.',
          },
          {
            icon: 'CalendarDays',
            title: 'Runs, not one-offs',
            body: 'Host Circles that walk a Journey together week after week. The format comes with it, so a group lasts past week three.',
          },
          {
            icon: 'Users',
            title: 'A path for your people',
            body: 'Member to Crew to Host to Guide to Mentor. Your regulars can step up, and nobody runs a room alone.',
          },
          {
            icon: 'HandHeart',
            title: 'A door held open',
            body: 'Your people join free, always, and a free Space sells from day one. You keep 100% of the bookings you bring yourself, and the network earns only on the business it sends you.',
          },
          {
            icon: 'LineChart',
            title: 'Tools to grow',
            body: 'A simple way to run the day to day, set the rhythm, and see your community take shape. Start free, grow when you are ready.',
          },
        ],
        layout: L,
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
        body: "That's the whole shape of it. Plans run from a free listing to larger team tiers, one honest monthly price each. Your own bookings stay yours: 0% on what you book yourself, always. We earn a small, shrinking cut only on the business the network brings you, and you see exactly what the network earned you. The full breakdown lives on the [pricing page](/pricing). Billing isn't turned on yet, so nothing charges today.",
        size: 'base',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Three steps ── make "claim a Space" concrete, as the DAWN numbered
    // milestone cards on the cream schematic (operators.html "How a space goes
    // live"). The builder leaves knowing exactly what to do. ────────────────────
    {
      type: 'BuildTimeline',
      props: {
        id: 'sp-how-steps',
        eyebrow: 'How you start',
        title: "Three steps and your room is open.",
        titleAccent: 'your room is open',
        kicker: '',
        intro: '',
        items: [
          {
            label: '01',
            title: 'Pick what you gather around',
            body: "A class, a walk, a supper table, a sit. That's your Channel.",
            highlight: 'normal',
          },
          {
            label: '02',
            title: 'Bring your people',
            body: "The regulars you have, or a few you want to call in. That's your Circle.",
            highlight: 'normal',
          },
          {
            label: '03',
            title: 'Hold the door, same time each week',
            body: 'We hand you the format, the script, and the backup.',
            highlight: 'chosen',
          },
        ],
        footnote: '',
        texture: 'dots',
        flow: 'beat',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── Mid-page CTA ── the highest-intent moment: they've seen what they get, the
    // deal, and the three steps. Ask here, not just at the bottom. Not ink (the
    // second dark beat is the welcome, below). ──────────────────────────────────
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
        emphasis: { scale: 'default', accent: 'none' },
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

    // ── The second dark beat ── why we run it this way, before the marquee and the
    // close. Atmospheric sunset image. ─────────────────────────────────────────
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

    // ── Guides for builders ── RECOVERED from the coded body: the Labs-track SEO
    // cluster cross-links that keep /spaces the hub of the builder funnel. ──────
    {
      type: 'FeatureGrid',
      props: {
        id: 'sp-guides',
        eyebrow: 'Guides for builders',
        title: 'How to build a third space.',
        titleAccent: 'third space',
        style: 'icon',
        columns: '2',
        items: [
          {
            icon: '',
            image: '',
            title: 'What a third space is',
            body: 'The definition, why they got rare, and how to build one today.',
            href: '/loneliness',
          },
          {
            icon: '',
            image: '',
            title: 'How to run a community space',
            body: 'The operator playbook: a rhythm, a room, a few regulars, light tooling.',
            href: '/how-to-build-community',
          },
          {
            icon: '',
            image: '',
            title: 'Tools for community builders',
            body: 'The four jobs a builder needs, and how one Space covers them.',
            href: '/tools-for-community-builders',
          },
          {
            icon: '',
            image: '',
            title: 'Host a recurring gathering',
            body: 'The logistics of recurrence: cadence, a run-of-show, and reminders.',
            href: '/host-a-recurring-gathering',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
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
        emphasis: { scale: 'default', accent: 'none' },
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
