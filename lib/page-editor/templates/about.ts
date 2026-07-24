import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT — the manifesto. The page that earns belief and calls in the builders.
//
// What this page does: tells the mission honestly and movingly, then calls in the
// people who will build it. The storyline runs: the problem (the loneliest era,
// the feed, the third place gone), the bet (real-world third places, a folding
// chair with your name on it), the origin (Moonlight Beach, 2020), the design
// principle (leaderful not leader-dependent, guru-free, one honest price), and the
// invitation (we build it together; you don't need permission, you need rails).
//
// CONTRACT (copied from the-community.ts, the exemplar):
//  • One `const L` layout literal, reused on every block so the rhythm stays even.
//  • Section rhythm = alternating tones (surface → canvas → surface …), with a
//    `Statement` interstitial between major movements and exactly ONE dark (`ink`)
//    beat near the end before the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    rendered verbatim (Circle, Channel, Pillar, Journey, Run, Outpost, Frequency
//    Lab; seven Channels, four Pillars). No em dashes. Sentence-case headings.
//    Contractions always. Honest at day zero: no member counts, no invented numbers.
//  • Movement-register language is the ONE allowance here (CONTENT-VOICE §6d) and
//    stays RATIONED: a few plain sentences, never "revolution." The folding-chair
//    line lives on this page, as the pull quote.
//  • CTA SYSTEM: the page calls in the Latent Leader. The primary action is
//    BETA_CTA_LABEL ("Start a Circle"), carried by the closing ink CallToAction,
//    with ONE quiet secondary text link for the Seeker (BETA_CTA_SECONDARY_LABEL,
//    "or just join as a member"). Never stack two buttons; a text link is not a
//    button. The hero carries the premise and no button.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the premise, no button. People watching a sunset:
    // the real-world third place, not a screen. ─────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'ab-hero',
        variant: 'image',
        eyebrow: 'Why we exist',
        title: 'The third place is gone. We hand people the tools to bring it back.',
        titleAccent: 'bring it back',
        subtitle:
          'Frequency is community infrastructure for real-world connection. Not another feed. A way to find your people, a format any host can run, and a real home to grow into.',
        image: '/images/site/nature-viewing-sunset.jpg',
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

    // ── The problem ── speak directly to the reader. The loneliest era, the feed,
    // the third place that quietly disappeared. Plain, not clinical. ─────────────
    {
      type: 'Heading',
      props: {
        id: 'ab-problem-h',
        eyebrow: 'The problem',
        title: 'You have a hundred contacts and no one to call on a Tuesday.',
        titleAccent: 'no one to call',
        kicker: "It's not just you. The places adults used to meet quietly disappeared.",
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
        id: 'ab-problem-b',
        body: "Most of us are more connected and more alone than people have ever been. The feed promised company and handed us a screen. Meanwhile the places that held a life together kept closing: the corner cafe, the rec league, the standing time with the same faces. The third places that aren't home and aren't work are the infrastructure friendship runs on, and most of us watched them go without noticing until they were gone.\n\nNobody's coming to fix that for us. No app, no algorithm, no company is going to hand the third place back. Roads, water, power: nobody throws a party about infrastructure, but nothing works without it. Connection is the same, and right now it's missing.",
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

    // ── Origin ── the honest beginning. Moonlight Beach, 2020. No guru, no brand,
    // just strangers who needed each other, and what it taught us. ──────────────
    {
      type: 'MediaText',
      props: {
        id: 'ab-origin',
        image: '/images/site/sunset-surf.jpg',
        alt: 'Two people leaning on a railing with surfboards, watching the sun set over the water',
        eyebrow: '2020 · Moonlight Beach',
        title: 'It started with strangers who needed each other.',
        titleAccent: 'needed each other',
        kicker: 'No membership, no marketing, no one in charge.',
        body: "In a season when everyone felt cut off, a few people started meeting on the bluffs above Moonlight Beach. Just breath, cold air, and each other. Word got out the way real things do, one person bringing another, until hundreds were showing up to breathe together at sunrise.\n\nThen it faded, because it ran on a few people's energy and energy runs out. There was no format, no home, no way to hold what had been built. But it left a painfully clear picture of exactly what to build so the next one could last.",
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

    // ── The bet ── what we are building, said plainly. Real-world third places and
    // the framework that puts them back. The mission beat. ──────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'ab-bet',
        image: '/images/site/sunset.jpg',
        alt: 'A quiet beach at sunset with the tide coming in under a wide pink sky',
        eyebrow: 'The bet',
        title: "Real rooms, in the real world, that miss you when you're gone.",
        titleAccent: "miss you when you're gone",
        kicker: 'A way to find your people, a format any host can run, a season to walk together, and a real home to grow into.',
        body: "Frequency is the framework that puts the third place back. You find what you practice through a Channel, gather a few people near you into a Circle, and walk a Journey together as a Run, week after week with the same faces. A real home, the Frequency Lab, is the place a community grows into.\n\nWe're not building a following. We're building the thing you can lean your whole weight on and trust to still be standing next year. The bet is simple: the cure for a lonely time isn't a better app. It's somewhere to go and people who notice when you don't.",
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

    // ── The design principle ── how it stays honest and lasts: leaderful, one
    // honest price, guru-free. The trust beat, said as three plain promises. ─────
    {
      type: 'Heading',
      props: {
        id: 'ab-principle-h',
        eyebrow: "How it's built",
        title: 'Built so no one person can capture it.',
        titleAccent: 'no one person',
        kicker: "A community built around one charismatic founder lives and dies with that person. We've all watched it happen, so this is built to be the opposite.",
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
        id: 'ab-principle-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '3',
        items: [
          {
            icon: '',
            image: '',
            title: 'Leaderful, not leader-dependent',
            body: 'Leaders rise from showing up, never from being anointed. Take any one of us away and it keeps running, because the practices, the places, and the people were the point all along.',
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'One honest price',
            body: "You keep 100% of your own bookings, always. The only fee is a small network-only take-rate, and it drops by plan. Physical Spaces get funded by a separate community-owned vehicle, never a cut of your work. One honest price, and you leave anytime with your data.",
            href: '',
          },
          {
            icon: '',
            image: '',
            title: 'Guru-free',
            body: "A real person started this, and it's built to not need him. If the format works in a stranger’s living room with none of us in the room, we've done our job. That's the bar.",
            href: '',
          },
        ],
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
        text: "You don't need permission to gather people. You need rails. We hand you the rails.",
        accent: 'rails',
        tone: 'surface',
        layout: L,
      },
    },

    // ── The single dark beat ── call in the community builders. The invitation,
    // spoken straight to the Latent Leader. ONE ink section before the close. ────
    {
      type: 'MediaText',
      props: {
        id: 'ab-call',
        image: '/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg',
        alt: 'A group on the beach celebrating together, arms raised at golden hour',
        eyebrow: 'The invitation',
        title: "If you're the one who gathers people, this is for you.",
        titleAccent: 'gathers people',
        kicker: '',
        body: "You know who you are. You're the one who texts the group, sets the time, holds the door. Maybe you tried hosting something once and it fizzled, and you carried that quietly. The fizzle was never about you. It was about doing it alone with no format and no backup.\n\nSo we're calling you in. Bring the people you already care about, pick a Channel, and run one Circle. We hand you the format, the script, and the backup, and we'd rather be judged on what we hand you than on who we are. This is a space we can all exist in and hold open for each other. We do not want to be followed. We want to be joined.",
        side: 'left',
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
          { text: 'Never a cut of your bookings' },
          { text: 'A real third place' },
          { text: 'Built to last' },
          { text: 'Joined, not followed' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only button on the page: Start a Circle, with the
    // quiet member path for the Seeker. ─────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'ab-cta',
        eyebrow: '',
        heading: 'Help us build it.',
        headingAccent: 'build it',
        body: "This time it gets a home, and it gets you. Find a few people near you, pick what you practice, and hold the door for one Circle. We'll point you at the first move.",
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
