import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// SPACES — "claim your space on Frequency". For operators who already run a group
// (practitioners, nonprofits, businesses, partners) and want to bring it onto
// Frequency. The promise that does the heavy lifting: your members always join
// free. We never charge the people who walk through your door. We only ask the
// operator to cover operator capacity.
//
// HOW THIS FILE IS BUILT (copies the-community.ts shape + section rhythm):
//  • One `const L` layout literal reused on every block.
//  • Alternating tone beat (surface → canvas → surface …), Statement interstitials
//    between movements, exactly ONE dark `ink` beat near the end, then the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    verbatim (Circle, Run, Channel, Member → Crew → Host → Guide → Mentor). No em
//    dashes, sentence-case headings, honest at day zero.
//  • Pricing stays a simple "what it costs and what your members get", NOT the full
//    table. The full table lives on /pricing; this page links there as the quiet
//    secondary door.
//  • ONE primary CTA: Join the Beta (BETA_CTA_LABEL/BETA_CTA_HREF). The closing
//    CallToAction is the only button, framed as "claim your space". The Hero carries
//    one quiet secondary link to /pricing; never two buttons stacked.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the promise. One primary door (Join the Beta) and one quiet
    // secondary link to the full pricing. Latent Leader / operator reader. ────────
    {
      type: 'Hero',
      props: {
        id: 'sp-hero',
        variant: 'image',
        eyebrow: 'Spaces',
        title: 'Bring your people to Frequency. They join free.',
        titleAccent: 'free',
        subtitle:
          'If you already run a studio, a nonprofit, a class, or a group of regulars, claim a Space on Frequency. Your members never pay to walk through your door. You only cover what it costs to run the room.',
        image: '/images/site/lab-storefront.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: 'See what a Space costs',
        ctaSecondaryHref: '/pricing',
        note: 'No card today. Nothing charges while we are in beta.',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── The core principle, said plainly. This is the whole pitch. ───────────────
    {
      type: 'Heading',
      props: {
        id: 'sp-principle-h',
        eyebrow: 'The deal',
        title: 'We never charge your members.',
        titleAccent: 'never',
        kicker: 'You cover operator capacity. The people who show up join for free.',
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
        id: 'sp-principle-b',
        body: 'Most platforms tax the room. They put a turnstile in front of your people and skim a cut every time someone walks in. We do the opposite. Being a Member of Frequency is free, forever, and that includes everyone you bring.\n\nWhat we ask is simple: you cover operator capacity, the cost of running your Space and its tools. Your members keep their free seat. You keep your group. Nobody at your door pays a tax to belong.',
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Statement',
      props: {
        id: 'sp-stmt-1',
        text: 'You run the room. We never put a turnstile in front of your people.',
        accent: 'turnstile',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Who a Space is for: the four doors. ──────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'sp-doors',
        eyebrow: 'Who claims a Space',
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
            body: 'You already gather a community around a cause. Give it a home where members never hit a paywall.',
            href: '',
          },
          {
            icon: 'Coffee',
            image: '',
            title: 'Businesses',
            body: 'You have a studio, a cafe, or a space and a crowd of regulars. Turn them into a Space they belong to.',
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

    // ── What you get: the operator tooling, in plain terms. ──────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'sp-bring',
        image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'A Frequency group gathered together outdoors',
        eyebrow: 'Bring it across',
        title: 'Your group, on rails that already work.',
        titleAccent: 'already work',
        kicker: 'You do not start over. You move in.',
        body: 'A Space gives your group a front door inside Discover, so the people looking for what you do can actually find you. Your regulars become Members, your gatherings become Events, and your weekly group becomes a Run that walks a Journey together.\n\nThe format, the script, and the backup come with it. You set out the chairs. We hand you the structure so the room runs itself.',
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Simple "what it costs and what your members get". NOT the full table. ─────
    {
      type: 'Heading',
      props: {
        id: 'sp-cost-h',
        eyebrow: 'What it costs',
        title: 'Simple math.',
        titleAccent: 'Simple',
        kicker: 'One line for your members. One line for you.',
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
        id: 'sp-cost-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '2',
        items: [
          {
            icon: '',
            image: '',
            title: 'Your members: free',
            body: 'Everyone you bring joins as a Member at no cost. Browse, show up, earn Zaps, meet Vera. No card, no paywall, no catch.',
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'You: cover the room',
            body: 'You pay a flat operator plan to run your Space and its tools. Plans start free and grow with you, from a solo practitioner to a full team.',
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
        id: 'sp-cost-note',
        body: 'That is the whole shape of it. Operator plans run from a free listing to larger team and white-label tiers, each at a flat monthly price with a small cut only on what you sell. The full breakdown lives on the [pricing page](/pricing). Billing is not turned on yet, so nothing charges today.',
        size: 'base',
        tone: 'surface',
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
        tone: 'canvas',
        layout: L,
      },
    },

    // ── The single dark beat ── why we run it this way, near the end. ────────────
    {
      type: 'MediaText',
      props: {
        id: 'sp-why',
        image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A Frequency gathering on a cliffside at golden hour',
        eyebrow: 'Why we do it this way',
        title: 'The room belongs to the people in it.',
        titleAccent: 'people in it',
        kicker: '',
        body: 'A community that taxes its own members slowly stops being a community. We have all watched it happen. So Frequency keeps membership free and asks the operators who run the rooms to cover the rooms.\n\nThat keeps the math honest. Your people belong because they show up, not because they paid at the door. And when you grow, the rails grow with you, never against you.',
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
          { text: 'Claim your Space' },
          { text: 'Members join free' },
          { text: 'Cover the room, not the people' },
          { text: 'Show up in Discover' },
          { text: 'Run one Circle' },
          { text: 'Keep your group' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only button: Join the Beta, framed as claim your Space.
    {
      type: 'CallToAction',
      props: {
        id: 'sp-cta',
        eyebrow: '',
        heading: 'Claim your Space.',
        headingAccent: 'Space',
        body: 'Bring your group to Frequency and keep it free for every person who walks in. Join the beta and we will set your Space up with you.',
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
