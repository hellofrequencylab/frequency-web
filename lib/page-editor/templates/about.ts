import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT — the page that earns belief. Mission + trust.
//
// What this page does: says what Frequency IS (community infrastructure for
// real-world connection), tells the honest origin (Moonlight Beach, 2020), and
// shows the parts that make it trustworthy: the two organizations and the
// pay-it-forward loop that keeps the door open, the governance that keeps it
// from riding on one person, and the guru-free design that makes it last.
//
// CONTRACT (copied from the-community.ts, the exemplar):
//  • One `const L` layout literal, reused on every block so the rhythm stays even.
//  • Section rhythm = alternating tones (surface → canvas → surface …), with a
//    `Statement` interstitial between major movements and exactly ONE dark (`ink`)
//    beat near the end before the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    rendered verbatim. No em dashes. Sentence-case headings. Honest at day zero:
//    no member counts, no leaderboards, no invented numbers.
//  • Movement-register language is RATIONED here (CONTENT-VOICE §6d): at most one
//    such sentence per section, always plain. The folding-chair line lives on this
//    page (the pull quote).
//  • ONE primary CTA: Join the Beta, from BETA_CTA_LABEL/BETA_CTA_HREF, in the
//    closing CallToAction. It is the only button on the page; never stack buttons.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the premise, no button. Moonlight Beach, where
    // the whole thing started. ─────────────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'ab-hero',
        variant: 'image',
        eyebrow: 'Our story',
        title: 'The third place is gone. We hand people the tools to bring it back.',
        titleAccent: 'bring it back',
        subtitle:
          'It started on a beach in 2020: no guru, no brand, just strangers who needed each other. We learned what it takes to make that last, and now we put it in the hands of the people who start the next one.',
        image: '/images/site/moonlight-1.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: '',
        ctaPrimaryHref: '',
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        note: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── What Frequency is ── the premise, said plainly. Community infrastructure
    // for real-world connection. ───────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'ab-premise-h',
        eyebrow: 'What this is',
        title: 'Community infrastructure for real-world connection.',
        titleAccent: 'real-world',
        kicker: 'Not another feed. The pipes and the framework a real community runs on.',
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
        id: 'ab-premise-b',
        body: 'Roads, water, power: nobody throws a party about infrastructure, but nothing works without it. Connection is the same. The corner cafe, the town square, the standing time with the same faces. The third places that are not home and not work are the infrastructure a life is held together by, and most of us watched them quietly disappear.\n\nFrequency is the framework that puts them back. A way to find your people, a format any host can run, a season to walk together, and a real home to grow into. We are not building a following. We are building the thing you can lean your whole weight on and trust to still be standing next year.',
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
        id: 'ab-stmt-1',
        text: 'No company is going to hand the third place back. People rebuild it, one Circle at a time.',
        accent: 'one Circle at a time',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Origin ── 2020, Moonlight Beach. The honest beginning. ─────────────────
    {
      type: 'MediaText',
      props: {
        id: 'ab-origin',
        image: '/images/site/moonlight-2.jpg',
        alt: 'A gathering on the bluffs above Moonlight Beach at sunrise',
        eyebrow: '2020 · Moonlight Beach',
        title: 'It started on a cliff at dawn.',
        titleAccent: 'dawn',
        kicker: 'No membership, no marketing, no one in charge.',
        body: 'In a season when everyone felt cut off, a few people started meeting on the bluffs above Moonlight Beach. Just breath, cold air, and each other.\n\nWord got out the way real things do: one person bringing another. Before long, hundreds of people were showing up to breathe together at sunrise, drawn by nothing but a hunger for something real that none of them could quite name.',
        side: 'left',
        imgAspect: 'portrait',
        focal: 'top',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── What we learned ── it grew, then fell apart, and showed us what to build.
    {
      type: 'MediaText',
      props: {
        id: 'ab-learned',
        image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'People in a quiet moment of breathwork together outdoors at golden hour',
        eyebrow: 'What we learned',
        title: 'A crowd, and nowhere to put it.',
        titleAccent: 'nowhere',
        kicker: 'It ran on a few people’s energy, and energy runs out.',
        body: 'There was no home, no structure, no way to hold what had been built. When the energy faded, it faded fast.\n\nBut it left a painfully clear picture of exactly what to build so next time it could last. Not more hype. Not a bigger personality. A format anyone can run, a model that does not depend on anyone’s stamina, a way to stay open to everyone, and a real home to grow into.',
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
      type: 'Statement',
      props: {
        id: 'ab-stmt-2',
        text: 'This time we build it to last.',
        accent: 'last',
        tone: 'surface',
        layout: L,
      },
    },

    // ── The two organizations + the pay-it-forward loop ── how the money moves,
    // said plainly. This is the trust beat: the structure is honest by design. ──
    {
      type: 'Heading',
      props: {
        id: 'ab-orgs-h',
        eyebrow: 'How it is built',
        title: 'Two organizations, one loop.',
        titleAccent: 'one loop',
        kicker: 'A nonprofit for the mission, a venue that funds it, and money that circulates instead of pooling at the top.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'ab-orgs-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '3',
        items: [
          {
            icon: '',
            image: '',
            title: 'The nonprofit',
            body: 'Carries the mission: free practices, open Circles, and the tools handed to anyone who wants to start one. It exists to help people heal and reconnect, not to turn a profit.',
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'The venue',
            body: 'The Frequency Lab is a real, for-profit third place. It pays its own way, and the surplus does not vanish into someone’s pocket. It funds the mission and keeps the free side free.',
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'The loop',
            body: 'People who can give more keep the doors open for people who can’t. Pay it forward, not exclusion. Nobody is priced out of belonging, and the money goes back into the room.',
            href: '',
          },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Governance ── why it cannot be captured by one person. The Women's
    // Council, the Vision Steward, matriarchal design. The trust spine. ─────────
    {
      type: 'MediaText',
      props: {
        id: 'ab-governance',
        image: '/images/site/PHOTO-2020-09-09-16-38-27.jpeg',
        alt: 'Dozens of neighbors practicing yoga together on a sunlit lawn between palm trees',
        eyebrow: 'How it stays honest',
        title: 'Built so no one person can capture it.',
        titleAccent: 'no one person',
        kicker: 'The governance is matriarchal by design, and that is on purpose.',
        body: 'A Women’s Council holds the values and has the final say on the things that matter most. A Vision Steward keeps the long arc and the mission steady, without owning the room. The design borrows from how communities have actually held themselves together for a very long time: care first, power shared, the next generation in mind.\n\nThe point is plain. A community built around one charismatic founder lives and dies with that person. We have all watched it happen. So the structure is set up to outlast any one of us, founder included.',
        side: 'left',
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

    // ── The rationed movement line ── the folding-chair line, as a pull quote.
    // CONTENT-VOICE §6d names this page as the place it is allowed to live. ─────
    {
      type: 'Quote',
      props: {
        id: 'ab-quote',
        variant: 'pull',
        quote: 'We think the answer to the loneliest era in history is a folding chair with your name on it.',
        accentWord: 'folding chair',
        attribution: 'The Frequency founding circle',
        role: '',
        avatar: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── The single dark beat ── guru-free, built to outlast its founder. One ink
    // section, near the end, before the close. ─────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'ab-guru',
        image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A music circle gathered on a cliffside above the ocean at golden hour',
        eyebrow: 'The one rule',
        title: 'A real person started this. It is built to not need him.',
        titleAccent: 'not need him',
        kicker: '',
        body: 'Frequency was started by people who lived the Moonlight Beach years and felt it disappear. That is the honest origin, and it is also the one rule we hold ourselves to: no founder you have to follow.\n\nSo we would rather be judged on what we hand you than on who we are. If the format works in a stranger’s living room with none of us in the room, we have done our job. That is the bar. We do not want to be followed. We want to be joined.',
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
        id: 'ab-marquee',
        items: [
          { text: 'Guru-free' },
          { text: 'Leaderful, not leader-dependent' },
          { text: 'Pay it forward' },
          { text: 'A real third place' },
          { text: 'Built to last' },
          { text: 'Joined, not followed' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only CTA on the page: Join the Beta. ──────────────
    {
      type: 'CallToAction',
      props: {
        id: 'ab-cta',
        eyebrow: '',
        heading: 'Be one of the first.',
        headingAccent: 'first',
        body: 'This time it gets a home, and it gets you. Help us choose where it seeds next, and we will point you at the first move.',
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
