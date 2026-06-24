import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE COMMUNITY — the EXEMPLAR template. Every other page template copies this
// file's shape and section rhythm, so keep it clean and legible.
//
// What this page does: says what Frequency's community IS, tells the builder
// narrative (the people who want to CREATE real-world connection, not just consume
// a feed), and shows the safety net so "starting one Circle" never reads as
// "doing it alone".
//
// HOW TO READ / COPY THIS FILE (the contract for the other page agents):
//  • One `const L` layout literal, reused on every block (`...L` or inline) so the
//    spacing rhythm is consistent. Override per-block only with intent.
//  • Section rhythm = an alternating beat of tones (surface → canvas → surface …),
//    with a `Statement` interstitial between major movements and exactly ONE dark
//    (`ink`) beat near the end before the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    are rendered verbatim (Circle, Run, Channel, Pillar, Member → Crew → Host →
//    Guide → Mentor). No em dashes. Sentence-case headings. Honest at day zero:
//    no member counts, no leaderboards, no invented numbers.
//  • ONE primary CTA on the page: Join the Beta, from BETA_CTA_LABEL/BETA_CTA_HREF.
//    The closing CallToAction is the only button. At most one quiet secondary link
//    elsewhere; never stack buttons.
//
// Block adjust props every block carries: tone ('surface'|'canvas'|'ink'),
// width ('default'|'wide'|'full'), align ('left'|'center'), layout (the L below).
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the one big promise, no button (the hero leads the
    // narrative; the single CTA waits for the close). ──────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'tc-hero',
        variant: 'image',
        eyebrow: 'The Community',
        title: 'Real connection is something you build, not something you scroll.',
        titleAccent: 'build',
        subtitle:
          'Frequency is for the people who want to make a third place where they live. A handful of neighbors, a standing time, and a shape that actually lasts.',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
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

    // ── Name the reader ── who this is for, said plainly. The builder narrative as
    // CONTENT, never a gate: you do not apply, you just start. ──────────────────
    {
      type: 'Heading',
      props: {
        id: 'tc-reader-h',
        eyebrow: 'Who this is for',
        title: 'The people who start the room.',
        titleAccent: 'start',
        kicker: 'Not joiners waiting for a place to appear. The ones who make it.',
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
        body: 'You already have the apps. What you are missing is a standing time, a handful of faces, and a group small enough that your absence leaves a hole. That is not a feature you download. It is a room someone decides to hold open.\n\nFrequency is for the person who decides. You do not need a big personality or a finished plan. You need a Channel you care about, a few people near you, and a format you can run. We hand you the rest.',
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
        id: 'tc-stmt-1',
        text: 'A community is not a feed. It is a few people who notice when you are gone.',
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
          { name: 'Member', blurb: 'You show up to a Circle. That is the whole entry fee.' },
          { name: 'Crew', blurb: 'You are in for the season, learning the format and lending a hand.' },
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
    {
      type: 'Statement',
      props: {
        id: 'tc-stmt-2',
        text: 'You set out the chairs for one Circle. We hand you the format.',
        accent: 'the format',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── Channels and Runs ── the core mechanic, in detail. A Channel is what you
    // practice; a Run is your Circle walking a Journey together. ────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tc-channels',
        image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'A Frequency Circle gathered for breathwork outdoors',
        eyebrow: 'Channels and Runs',
        title: 'Find your people. Walk it together.',
        titleAccent: 'together',
        kicker: 'Two words are all it takes to find your place.',
        body: 'A Channel is what you practice: one of the seven topics inside the Pillars. Breathwork, strength, sound, supper clubs. It ties you to the people near you who care about the same thing.\n\nA Run is your Circle walking a Journey together, week after week, with a standing time and the same faces. The Channel finds your people. The Run is how you actually become regulars.',
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
          { icon: 'Star', image: '', title: 'Mind', body: 'Meditation, breathwork, learning. The quiet practices that settle a nervous system.', href: '' },
          { icon: 'Flame', image: '', title: 'Body', body: 'Movement, strength, cold and heat. The practices you feel the next morning.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Spirit', body: 'Ceremony, sound, human relating. The work you do shoulder to shoulder.', href: '' },
          { icon: 'Music', image: '', title: 'Expression', body: 'Music, art, dance, making things. The creative practices that need a room and a crowd.', href: '' },
        ],
        tone: 'canvas',
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
        image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A Frequency music circle gathered on a cliffside at golden hour',
        eyebrow: 'Why it lasts',
        title: 'Guru-free. By design.',
        titleAccent: 'Guru-free',
        kicker: '',
        body: 'Communities built around one charismatic founder live and die with that person. We have all watched it happen. So Frequency is built to be the opposite: leaderful, not leader-dependent.\n\nLeaders rise from showing up, never from being anointed. Take the structure away from any one of us and it keeps running, because the practices, the places, and the people were the point all along.',
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
          { text: 'Pick a Channel' },
          { text: 'Hold the door' },
          { text: 'Run one Circle' },
          { text: 'Be missed when you are gone' },
          { text: 'Lead by showing up' },
          { text: 'Pay it forward' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only CTA on the page: Join the Beta. ───────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tc-cta',
        eyebrow: '',
        heading: 'Be the reason your people have somewhere to go.',
        headingAccent: 'somewhere to go',
        body: 'Pick a Channel, find a few neighbors, and hold the door open for one Circle. We hand you the format, the script, and the backup.',
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
