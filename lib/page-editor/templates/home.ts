import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// HOME — the front door. The whole Frequency arc in one scroll, written to make a
// Seeker feel seen and a Latent Leader feel summoned. The reader is warm to the
// founder but cold to Frequency, mostly on a phone, off a social video.
//
// The arc, in order:
//  1. Hero — the loneliest era, named the way the reader would say it.
//  2. The problem — the feed vs a room that misses you.
//  3. The folding-chair Statement — the ONE rationed movement line (CONTENT-VOICE
//     §6d): appears exactly once on the page.
//  4. What Frequency is — a community you can run, with the Pillar > Channel >
//     Circle structure and the Quest in one line.
//  5. A Run, up close — the concrete shape of one night (CircleFirstNight).
//  6. The ladder — Member → Crew → Host → Guide → Mentor, "never out front alone".
//  7. Mid CTA — the highest-intent moment: call in the builders.
//  8. The movement beat — the single ink section (MediaText), call in the builders,
//     with the SECOND and last movement-register sentence, plain.
//  9. Marquee — the rhythm band.
// 10. Close — the ink CTA.
//
// Shape + rhythm copy the EXEMPLAR (templates/the-community.ts):
//  • One `const L` layout literal, reused on every block.
//  • Alternating tone beat (surface → canvas → surface …), a `Statement`
//    interstitial between movements, exactly ONE dark (`ink`) beat before the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    rendered verbatim (Circle, Channel, Pillar, Journey, Run, Quest; Member → Crew
//    → Host → Guide → Mentor). Pillar > Channel > Circle (docs/NAMING.md). No em
//    dashes. Sentence-case headings. Contractions always. Honest at founding stage:
//    no member counts, no leaderboards, no invented numbers.
//  • CTA SYSTEM (matches the-community): the primary action is BETA_CTA_LABEL
//    ("Start a Circle"), at the mid CTA (highest intent) and the ink close, each
//    paired with ONE quiet secondary text link for the Seeker
//    (BETA_CTA_SECONDARY_LABEL, "or just join as a member"). The hero leads with no
//    button; the single CTA system waits for the mid and the close. Never stack two
//    buttons.
//  • Movement-register sentences are RATIONED to two on the whole page (the
//    folding-chair Statement and one line in the ink beat), both plain
//    (CONTENT-VOICE §6d).
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the one big promise, no button (the hero leads; the
    // CTA system waits for the mid and the close). Image: a group dancing together
    // outdoors at golden hour, hands in the air, a real gathering, not a crowd. ───
    {
      type: 'Hero',
      props: {
        id: 'home-hero',
        variant: 'image',
        eyebrow: 'Frequency',
        title: 'You have a hundred contacts and no one to call on a Tuesday.',
        titleAccent: 'Tuesday',
        subtitle:
          "Frequency is community you build where you live. A few neighbors, a standing time, and a room that misses you when you're gone. The first rooms start now.",
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: '',
        ctaPrimaryHref: '',
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        note: "We're just opening. The first Hosts set the tone.",
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── Name the problem ── say it the way the reader would say it. Plain sentences,
    // no narrating their feelings. ──────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'home-problem-h',
        eyebrow: 'The problem, plainly',
        title: 'Wired all day. Lonely all week. Done with the feed.',
        titleAccent: 'Lonely',
        kicker: "You're not broken. The default just stopped working.",
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
        id: 'home-problem-b',
        body: 'You can switch jobs, cities, and phones, and still end most weeks the same way: scrolling, wired, and short on people who would actually notice if you went quiet.\n\nThe feed isn\'t a friend. It\'s a job you never clock out of. Making friends as an adult is hard, the third places keep closing, and "we should hang out" almost never turns into a Tuesday. None of that is a personal failing. The shape that used to hold people together is just gone.',
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The folding-chair Statement ── the FIRST of two rationed movement lines
    // (CONTENT-VOICE §6d). Appears exactly once on the page. ─────────────────────
    {
      type: 'Statement',
      props: {
        id: 'home-stmt-1',
        text: 'The answer to the loneliest era in history is a folding chair with your name on it.',
        accent: 'folding chair',
        tone: 'surface',
        layout: L,
      },
    },

    // ── What Frequency is ── not an app to scroll. A community you can run, with the
    // rails real-world connection needs. ────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'home-answer-h',
        eyebrow: 'What Frequency is',
        title: 'A community you can actually run.',
        titleAccent: 'run',
        kicker: 'Not another place to scroll. A shape for getting people in a room.',
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'home-answer-b',
        body: "Frequency hands you the rails that real connection needs and almost no one has: a format, a script, a standing time, and the backup so you're never out front alone. You bring a Channel you care about and a few people near you. We bring the rest.\n\nIt starts in living rooms and parks, the way it always has. You don't have to wait for a building to open to start a Circle this week.",
        size: 'lg',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The structure ── Pillar > Channel > Circle, on canon, with the Quest in one
    // line. Image: friends lifting and catching each other in play, a Channel made
    // real, people literally holding each other up. ─────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'home-structure',
        image: '/images/site/PHOTO-2020-10-07-14-38-02.jpeg',
        alt: 'Friends lifting and catching one another in a burst of play on the beach',
        eyebrow: 'How it fits together',
        title: 'Pillar, Channel, Circle.',
        titleAccent: 'Circle',
        kicker: 'Three plain layers, from the whole of a life down to your Tuesday night.',
        body: 'A Pillar is one quarter of a whole life: Mind, Body, Spirit, Expression. A Channel is what you practice inside it, one of the seven topics, like Movement, Creative, or Human Relating. A Circle is the few people near you who show up to practice it together.\n\nThe Quest is the game that makes the practices easy to actually do: three Journeys a season, one each for Mind, Body, and Spirit. A Circle walking a Journey together, week after week, is a Run.',
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

    // ── A Run, up close ── make "run one Circle" concrete: the shape of one night,
    // and the host did not have to invent it. ───────────────────────────────────
    {
      type: 'CircleFirstNight',
      props: {
        id: 'home-first-night',
        eyebrow: 'A Run, up close',
        title: 'What the first night actually looks like.',
        titleAccent: 'first night',
        kicker: 'A Circle running a Journey together is a Run. Here is the shape of one evening.',
        footnote:
          'No host has to invent it. The format comes with the Journey, so the first night runs itself and you just hold the door.',
        cardLabel: 'Weekly Run',
        cardTitle: 'Tuesday, 6:30pm',
        rows: [
          { time: '0:00', title: 'Arrive and settle', note: 'Tea, a folding chair, names around the room.' },
          { time: '0:15', title: 'Open the week', note: 'The host reads the prompt the Journey set for tonight.' },
          { time: '0:30', title: 'The practice', note: 'You do the thing together: sit, move, or make.' },
          { time: '1:00', title: 'Share and close', note: 'A short round, then plans for next week.' },
        ],
        tone: 'surface',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── The ladder ── Member → Crew → Host → Guide → Mentor, with the "never out
    // front alone" beat that answers the builder's fear. ────────────────────────
    {
      type: 'RolesPath',
      props: {
        id: 'home-roles',
        eyebrow: 'The ladder',
        title: 'You are never out front alone.',
        titleAccent: 'never',
        kicker: 'Step up as far as you want. Every rung has the one above it for backup.',
        rungs: [
          { name: 'Member', blurb: "You show up to a Circle. That's the whole entry fee." },
          { name: 'Crew', blurb: "You're in for the season, learning the format and lending a hand." },
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

    // ── Mid CTA ── the highest-intent moment: they have seen the structure, the
    // night, and the ladder. Ask here. Not ink (the single dark beat is below). ──
    {
      type: 'CallToAction',
      props: {
        id: 'home-cta-mid',
        eyebrow: '',
        heading: 'Hold the door for one Circle.',
        headingAccent: 'one Circle',
        body: "You've seen the structure, the night, and the ladder. The first Hosts are setting the tone now.",
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

    // ── The movement beat ── the single ink section. Call in the builders. Carries
    // the SECOND and last movement-register sentence, plain (CONTENT-VOICE §6d).
    // Image: playful lawn hula-hooping, the proof that a community can be joy. ────
    {
      type: 'MediaText',
      props: {
        id: 'home-builders',
        image: '/images/site/hula-hoop-party.jpg',
        alt: 'People playing with hula hoops together on a sunny lawn',
        eyebrow: "Who we're calling in",
        title: 'The people who start things.',
        titleAccent: 'start things',
        kicker: "You're not waiting for the place to appear. You're ready to make it happen.",
        body: "This is a movement of people building real connection where they live, and it only works if we build it together. You don't need a big personality or a finished plan. You need a Channel you care about, a few people near you, and a format you can run.\n\nWe hand you the rest, and a whole ladder of people who have your back. Start one Circle, and you're not on your own. You're part of a community of builders, holding doors open in their own towns at the same time.",
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

    // ── Rhythm band ── the marquee, same beat as the rest of the site. ──────────
    {
      type: 'Marquee',
      props: {
        id: 'home-marquee',
        items: [
          { text: 'Pick a Channel' },
          { text: 'Find a few neighbors' },
          { text: 'Hold the door' },
          { text: 'Run one Circle' },
          { text: 'Show up Tuesday' },
          { text: "Be missed when you're gone" },
        ],
        layout: L,
      },
    },

    // ── Close ── the ink CTA. Primary action plus the quiet member path. ────────
    {
      type: 'CallToAction',
      props: {
        id: 'home-cta',
        eyebrow: '',
        heading: 'Be the reason your people have somewhere to go.',
        headingAccent: 'somewhere to go',
        body: "No members yet, no waitlist theater. Find a few neighbors, pick what you practice, and hold the door for one Circle. We'll bring you in as the first rooms take shape near you.",
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
