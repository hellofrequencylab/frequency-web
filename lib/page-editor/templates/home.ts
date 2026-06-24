import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// HOME — the splash. The cold open for a visitor who is warm to the founder but
// cold to Frequency, mostly on a phone, off a social video.
//
// What this page does: names the problem plain (lonely, wired, tired of the
// feed), gives the answer concrete (a community framework you can run, with real
// homes coming), then opens the three doors down to The Community, The Quest, and
// The Lab, and ends on the one invitation: Join the Beta.
//
// Shape + rhythm copy the EXEMPLAR (templates/the-community.ts):
//  • One `const L` layout literal, reused on every block.
//  • Alternating tone beat (surface → canvas → surface …), a `Statement`
//    interstitial between movements, exactly ONE dark (`ink`) beat: the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    rendered verbatim (Circle, Run, Quest, Journey, Pillar). No em dashes.
//    Sentence-case headings. Honest at day zero: no member counts, no leaderboards,
//    no invented numbers. The Labs are "coming," never "open."
//  • ONE primary CTA: Join the Beta, from BETA_CTA_LABEL/BETA_CTA_HREF, on the
//    closing CallToAction. It is the only button on the page.
//  • The cleared movement line ("a folding chair with your name on it") appears
//    exactly once, in a Statement (CONTENT-VOICE §6d ration rule).
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the one big promise, no button (the hero leads;
    // the single CTA waits for the close). ──────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'home-hero',
        variant: 'image',
        eyebrow: 'Frequency',
        title: 'You have a hundred contacts and no one to call on a Tuesday.',
        titleAccent: 'Tuesday',
        subtitle:
          'Frequency is a community you can run where you live. A handful of neighbors, a standing time, and a shape that holds. Real homes for it are coming. The first room starts now.',
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

    // ── Name the problem ── say it the way the reader would say it: lonely,
    // wired, tired of the feed. Plain sentences, no narrating their feelings. ────
    {
      type: 'Heading',
      props: {
        id: 'home-problem-h',
        eyebrow: 'The problem, plainly',
        title: 'Wired all day. Lonely all week. Done with the feed.',
        titleAccent: 'Lonely',
        kicker: 'You are not broken. The default just stopped working.',
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
        body: 'You can switch jobs, cities, and phones, and still end most weeks the same way: scrolling, wired, and short on people who would actually notice if you went quiet.\n\nThe feed is not a friend. It is a job you never clock out of. Making friends as an adult is hard, the third places keep closing, and "we should hang out" almost never turns into a Tuesday. None of that is a personal failing. The shape that used to hold people together is just gone.',
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The cleared movement line ── used exactly once (CONTENT-VOICE §6d). ─────
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

    // ── The answer, concrete ── not an app to scroll. A framework you can run,
    // with real homes for it coming. ───────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'home-answer-h',
        eyebrow: 'The answer',
        title: 'A community you can actually run.',
        titleAccent: 'run',
        kicker: 'Not another place to scroll. A shape for getting people in a room.',
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
        id: 'home-answer-b',
        body: 'Frequency hands you the rails that real-world connection needs and almost no one has: a format, a script, a standing time, and the backup so you are never out front alone. You bring a Channel you care about and a few people near you. We bring the rest.\n\nIt starts in living rooms and parks, the way it always has. The brick-and-mortar homes for it, the Frequency Labs, are coming next. You do not have to wait for a building to open to start a Circle this week.',
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Three doors ── The Community, The Quest, The Lab. FeatureGrid image
    // cards, each linking down to its page. No member counts, no stats. ─────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'home-doors',
        eyebrow: 'Three ways in',
        title: 'Pick the door that fits.',
        titleAccent: 'door',
        style: 'image',
        columns: '3',
        items: [
          {
            icon: 'Users',
            image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
            title: 'The Community',
            body: 'Circles, the people who run them, and the safety net under everyone. This is the part you can start this week.',
            href: '/the-community',
          },
          {
            icon: 'Compass',
            image: '/images/site/community-1.jpg',
            title: 'The Quest',
            body: 'The game that makes the practices easy to actually do. Three Journeys a season: Mind, Body, Spirit.',
            href: '/the-quest',
          },
          {
            icon: 'MapPin',
            image: '/images/site/lab-storefront.jpg',
            title: 'The Lab',
            body: 'The first brick-and-mortar home, being built by the people who will use it. A real room, coming soon.',
            href: '/the-lab',
          },
        ],
        tone: 'surface',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── The invitation interstitial ── one quiet line before the close. ────────
    {
      type: 'Statement',
      props: {
        id: 'home-stmt-2',
        text: 'No app fixes this. A few people in a room, every week, does.',
        accent: 'a room',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── Rhythm band ── the marquee, same beat as the rest of the site. ─────────
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
          { text: 'Be missed when you are gone' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only CTA on the page: Join the Beta. ───────────────
    {
      type: 'CallToAction',
      props: {
        id: 'home-cta',
        eyebrow: '',
        heading: 'Be in the first room.',
        headingAccent: 'first room',
        body: 'No members yet, no waitlist theater. Join the beta community, and we will bring you in as the first Circles take shape near you.',
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
