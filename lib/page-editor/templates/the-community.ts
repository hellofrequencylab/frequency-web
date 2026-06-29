import type { Data } from '@measured/puck'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE COMMUNITY — the EXEMPLAR template. Every other page template copies this
// file's shape and section rhythm, so keep it clean and legible.
//
// What this page does: says what Frequency's community IS, tells the builder
// narrative (the people who want to CREATE real-world connection, not just consume
// a feed), shows the safety net so "starting one Circle" never reads as "doing it
// alone", and gives a sold reader the concrete next step (How you start) plus a
// place to act at every high-intent moment.
//
// HOW TO READ / COPY THIS FILE (the contract for the other page agents):
//  • One `const L` layout literal, reused on every block (`...L` or inline) so the
//    spacing rhythm is consistent. Override per-block only with intent.
//  • Section rhythm = an alternating beat of tones (surface → canvas → surface …),
//    with a `Statement` interstitial between major movements and exactly ONE dark
//    (`ink`) beat near the end (Guru-free) before the ink close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    are rendered verbatim (Circle, Run, Channel, Pillar, Journey; Member → Crew →
//    Host → Guide → Mentor). Pillar > Channel > Circle (docs/NAMING.md). No em
//    dashes. Sentence-case headings. Contractions always (CONTENT-VOICE §5e).
//    Honest at day zero: no member counts, no leaderboards, no invented numbers.
//  • CTA SYSTEM (updated June 2026): the page activates the Latent Leader
//    (CONTENT-VOICE §2b/§7b). The primary action is BETA_CTA_LABEL ("Start a
//    Circle") and appears at THREE moments — the hero, a mid-page CallToAction
//    after the How-you-start steps (highest intent), and the ink close. Each
//    primary carries ONE quiet secondary text link for the Seeker
//    (BETA_CTA_SECONDARY_LABEL, "or just join as a member"). Never stack two
//    buttons; a secondary text link is not a button. The hero's `note` carries
//    honest founding status instead of fake urgency.
//
// Block adjust props every block carries: tone ('surface'|'canvas'|'ink'),
// width ('default'|'wide'|'full'), align ('left'|'center'), layout (the L below).
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the one big promise, and the first place to act.
    // Image is a calm sunrise meditation Circle (a real gathering), not a crowd:
    // the builder, not the party-goer, is the reader. ───────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'tc-hero',
        variant: 'image',
        eyebrow: 'The Community',
        title: 'Real connection is something you build, not something you scroll.',
        titleAccent: 'something you build',
        subtitle:
          "Frequency is for people who want to build community where they live. A few neighbors, a standing time, and a room that misses you when you're gone.",
        image: '/images/site/PHOTO-2020-10-07-14-38-04.jpeg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL,
        ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        note: "We're just opening. The first Hosts set the tone.",
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── Name the reader ── who this is for, said plainly. The builder narrative as
    // CONTENT, never a gate: you do not apply, you just start. ──────────────────
    {
      type: 'Heading',
      props: {
        id: 'tc-reader-h',
        eyebrow: 'Who this is for',
        title: 'For the people who start things.',
        titleAccent: 'start things',
        kicker: "You're not waiting for the place to appear. You're ready to make it happen.",
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
        id: 'tc-reader-b',
        body: "You already have the apps. What you're missing is a standing time, a handful of faces, and a group small enough that your absence leaves a hole. That's not a feature you download. It's a room someone decides to hold open.\n\nFrequency is for the person who decides. You don't need a big personality or a finished plan. You need a Channel you care about, a few people near you, and a format you can run. We hand you the rest.",
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
        id: 'tc-stmt-1',
        text: "A community is not a feed. It's a few people who notice when you're gone.",
        accent: 'notice',
        tone: 'surface',
        layout: L,
      },
    },

    // ── CircleFirstNight ── make "run one Circle" concrete: here is the actual
    // shape of one evening, and the host did not have to invent it. ─────────────
    {
      type: 'CircleFirstNight',
      props: {
        id: 'tc-first-night',
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
        tone: 'canvas',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── RolesPath ── the safety net. Member → Crew → Host → Guide → Mentor, with
    // the "you are never out front alone" beat that answers the builder's fear. ──
    {
      type: 'RolesPath',
      props: {
        id: 'tc-roles',
        eyebrow: 'The path',
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
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── How you start ── the concrete next step (replaces the old "you set out the
    // chairs" interstitial). Numbered steps so the sold reader knows exactly what
    // to do. "We hand you the format" lives inside step 3. ──────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-how',
        eyebrow: 'How you start',
        title: "Three steps and you're holding a room.",
        titleAccent: 'holding a room',
        style: 'number',
        columns: '3',
        items: [
          { icon: 'Compass', image: '', title: 'Pick what you practice', body: "A hike, a book, a supper table, a sit. That's your Channel.", href: '' },
          { icon: 'Users', image: '', title: 'Find a few people near you', body: "Three is enough to begin. That's your Circle.", href: '' },
          { icon: 'CalendarDays', image: '', title: 'Hold the door, same time each week', body: 'We hand you the format, the script, and the backup.', href: '' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Mid-page CTA ── the highest-intent moment: they have seen the night, the
    // path, and the three steps. Ask here, not just at the bottom. Not ink (the
    // single dark beat is Guru-free, below). ────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tc-cta-mid',
        eyebrow: '',
        heading: 'Hold the door for one Circle.',
        headingAccent: 'one Circle',
        body: "You've seen the night, the path, and the three steps. The first Hosts are setting the tone now.",
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

    // ── Channels and Runs ── the core mechanic, in detail and on canon. A Channel
    // is what you practice (a topic under a Pillar); a Run is your Circle walking a
    // Journey together. Pillar > Channel > Circle (docs/NAMING.md). ─────────────
    {
      type: 'MediaText',
      props: {
        id: 'tc-channels',
        image: '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg',
        alt: 'A Frequency group spinning hula hoops together on the beach at golden hour',
        eyebrow: 'Channels and Runs',
        title: 'Find your people. Walk it together.',
        titleAccent: 'together',
        kicker: 'Find what you practice, then the people who practice it too.',
        body: "A Channel is what you practice: one of the seven topics that live under the four Pillars. Breathwork, strength, sound, supper clubs. It ties you to the people near you who care about the same thing.\n\nA Run is your Circle walking a Journey together, week after week, with a standing time and the same faces. The Channel finds your people. The Run is how you become regulars.",
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
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-pillars-grid',
        eyebrow: 'The four Pillars',
        title: 'A whole life has four Pillars.',
        titleAccent: 'four Pillars',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'Star', image: '', title: 'Mind', body: 'Meditation, breathwork, learning. The quiet practices that calm you down.', href: '' },
          { icon: 'Flame', image: '', title: 'Body', body: 'Movement, strength, cold and heat. The practices you feel the next morning.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Spirit', body: 'Ceremony, sound, human relating. The work you do shoulder to shoulder.', href: '' },
          { icon: 'Music', image: '', title: 'Expression', body: 'Music, art, dance, making things. The creative practices that need a room and a crowd.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The single dark beat ── why this lasts: leaderful, not leader-dependent.
    // Exactly one ink section, near the end, before the close. ──────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tc-guru',
        image: '/images/site/outdoor-group.jpg',
        alt: 'Frequency members hanging out together on rugs under a shade tent, nobody at the front',
        eyebrow: 'Why it lasts',
        title: 'Guru-free. By design.',
        titleAccent: 'Guru-free',
        kicker: '',
        body: "Communities built around one charismatic founder live and die with that person. We've all watched it happen. So Frequency is built to be the opposite: leaderful, not leader-dependent.\n\nLeaders rise from showing up, never from being anointed. Take the structure away from any one of us and it keeps running, because the practices, the places, and the people were the point all along.",
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
        id: 'tc-marquee',
        items: [
          { text: 'Find your people' },
          { text: 'Hold the door' },
          { text: 'Run one Circle' },
          { text: "Be missed when you're gone" },
          { text: 'Lead by showing up' },
          { text: 'Pay it forward' },
        ],
        layout: L,
      },
    },

    // ── Close ── the ink CTA. Primary action plus the quiet member path. ─────────
    {
      type: 'CallToAction',
      props: {
        id: 'tc-cta',
        eyebrow: '',
        heading: 'Be the reason your people have somewhere to go.',
        headingAccent: 'somewhere to go',
        body: 'Find a few neighbors, pick what you practice, and hold the door open for one Circle. We hand you the format, the script, and the backup.',
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
