import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE QUEST — the explainer for the game. Built to the exemplar shape in
// the-community.ts: one shared `L` layout literal, an alternating tone beat with
// `Statement` interstitials between movements, exactly ONE dark `ink` beat near
// the end, and a single closing CTA (Join the Beta) as the only button.
//
// What this page does: opens on PURPOSE, not mechanics. The Quest is meditation
// and movement dressed as a game, on purpose, so people actually do the thing.
// Then it shows the real shape: a thirteen-week season of three Journeys (Mind,
// Body, Spirit), each capped by an Expression Challenge; the Practices you log;
// the Mindless timer; the Zaps that roll into Gems and into the Vault; the ranks
// you earn by finishing.
//
// Canon rendered verbatim (docs/NAMING.md): a Quest is one season (13 weeks),
// three Journeys run in order (Mind, Body, Spirit, ~4 weeks each), each capped by
// an Expression Challenge (Expression is NOT a fourth Journey). Practices are
// real-world acts. Mindless is the one timer, modes Be Still / Get Moving. Zaps
// roll into Gems FLAT at 5:1 at season end, spent in the Vault. Ranks are
// Ghost / Initiate / Adept / Master by Journeys finished (0/1/2/3). Never
// "points," never "cohort," never a leaderboard. No em dashes, sentence-case
// headings, honest at day zero (no member counts, no invented numbers).
//
// ONE primary CTA: Join the Beta, from BETA_CTA_LABEL / BETA_CTA_HREF. The
// closing CallToAction is the only button on the page.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the one big promise, no button. Purpose first: the game exists so
    // the good habits actually stick. ──────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'tq-hero',
        variant: 'image',
        eyebrow: 'The Quest',
        title: 'We made the good habits a game so people actually do them.',
        titleAccent: 'a game',
        subtitle:
          'Yes, a lot of it is meditation and movement. We know how that lands. So we built a game around it, because a streak you want to keep beats a resolution you forget by February.',
        image: '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg',
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

    // ── Why a game ── the purpose, said plainly. The honesty wink lives here. ───
    {
      type: 'Heading',
      props: {
        id: 'tq-why-h',
        eyebrow: 'Why a game',
        title: 'The point is the life, not the score.',
        titleAccent: 'the life',
        kicker: 'A game is just the trick that gets you to keep showing up.',
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
        id: 'tq-why-b',
        body: 'A good game knows how to pull you back: something to climb, progress you can see, a reason to return tomorrow. Almost every game spends that pull on nothing. The Quest spends it on the things that actually build a life. Sit for ten minutes. Take the walk. Show up to the Circle on Tuesday.\n\nWe are not shy about it: a lot of the work is meditation and movement, the stuff people mean to do and never quite get to. The game is how we close that gap. You do the real thing, the game keeps score of it, and the score is just a mirror held up to a life you are actually living.',
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
        id: 'tq-stmt-1',
        text: 'A streak you want to keep beats a resolution you forget.',
        accent: 'want to keep',
        tone: 'surface',
        layout: L,
      },
    },

    // ── SeasonTimeline ── the real shape of a Quest: thirteen weeks, three
    // Journeys (Mind, Body, Spirit), each capped by an Expression Challenge. ────
    {
      type: 'SeasonTimeline',
      props: {
        id: 'tq-season',
        eyebrow: 'A Quest, up close',
        title: 'A season is thirteen weeks.',
        titleAccent: 'thirteen weeks',
        kicker: 'Three Journeys, run in order, each capped by an Expression Challenge.',
        legs: [
          {
            pillar: 'Mind',
            weeks: '~4 weeks',
            blurb: 'Meditation, breathwork, and the quiet practices that settle a nervous system. The first leg of the season.',
          },
          {
            pillar: 'Body',
            weeks: '~4 weeks',
            blurb: 'Movement, strength, cold and heat. The practices you feel the next morning.',
          },
          {
            pillar: 'Spirit',
            weeks: '~4 weeks',
            blurb: 'Ceremony, sound, and human relating. The work you do shoulder to shoulder.',
          },
        ],
        capstoneLabel: 'Expression Challenge',
        capstoneNote: 'Expression is not a fourth Journey. It is the Challenge that closes each leg: make something, share it with your people, and finish the Journey. Three Journeys, three Challenges, one season.',
        tone: 'canvas',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── Practices ── the atomic real-world act. What you actually log. ──────────
    {
      type: 'MediaText',
      props: {
        id: 'tq-practices',
        image: '/images/site/PHOTO-2020-10-07-14-38-02.jpeg',
        alt: 'A Frequency circle gathered close together, laughing in golden afternoon light',
        eyebrow: 'Practices',
        title: 'Small real acts, one at a time.',
        titleAccent: 'small real acts',
        kicker: 'A Practice is the smallest unit of the game: one real thing you did.',
        body: 'A Practice is a single real-world act. Sit for ten minutes. Take the cold plunge. Walk while you call your mother. Each Journey is built from a handful of them, and you log them as you go.\n\nPractices come in three weights: light, standard, and heavy. A two-minute breath is light. A long Saturday hike is heavy. The heavier the act, the more it pays, so the game leans you toward the things that take a little more of you.',
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

    // ── Mindless ── the timer that runs a sit or a session. Two modes only. ────
    {
      type: 'MediaText',
      props: {
        id: 'tq-mindless',
        image: '/images/site/PHOTO-2020-09-09-16-38-27.jpeg',
        alt: 'A quiet moment of stillness in soft natural light',
        eyebrow: 'Mindless',
        title: 'Get out of your head, and into your life.',
        titleAccent: 'into your life',
        kicker: 'One timer, two modes. The screen exists only to let you put the phone down.',
        body: 'Mindless is the timer you run a Practice on. It has two modes. **Be Still** is the quiet sit: meditate, breathe, journal, or just log the minutes. **Get Moving** is the moving one: walk, run, yoga, strength, stretch, play.\n\nYou tune out to start, tune back in when you are done, and the time you gave counts. That is the whole design. The point of the screen is to make it easy to stop looking at the screen.',
        side: 'right',
        imgAspect: 'portrait',
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
        id: 'tq-stmt-2',
        text: 'You do the real thing. The game just keeps score of it.',
        accent: 'the real thing',
        tone: 'surface',
        layout: L,
      },
    },

    // ── QuestLoop ── show up, earn Zaps, roll into Gems at 5:1, spend in the
    // Vault. The economy, in four honest steps. ────────────────────────────────
    {
      type: 'QuestLoop',
      props: {
        id: 'tq-loop',
        eyebrow: 'The loop',
        title: 'Show up. That is the whole game.',
        titleAccent: 'Show up',
        kicker: 'Real acts earn Zaps. At season end they roll into Gems you can spend.',
        stages: [
          { label: 'Show up', blurb: 'Log a Practice, finish a Challenge, take on a Task. In person counts most.' },
          { label: 'Earn Zaps', blurb: 'Every real act pays Zaps. No leaderboard to climb, no streak to perform for a crowd.' },
          { label: 'Roll into Gems', blurb: 'At season end your Zaps convert to Gems at a flat five to one.' },
          { label: 'Spend in the Vault', blurb: 'Gems are yours to spend in the Vault, the member treasury where rewards live.' },
        ],
        ratioNote: 'The rate is fixed and flat: five Zaps become one Gem at the close of every season. The game is free, the same for everyone, and you only ever earn it by turning up. No points, no pay to win.',
        tone: 'canvas',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── Ranks ── earned by finishing, not by score. Ghost to Master. ───────────
    {
      type: 'Heading',
      props: {
        id: 'tq-ranks-h',
        eyebrow: 'Season ranks',
        title: 'You rank up by finishing, not by farming.',
        titleAccent: 'finishing',
        kicker: 'Your rank is simply how many Journeys you finished this season.',
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tq-ranks-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '2',
        items: [
          { icon: 'Compass', image: '', title: 'Ghost', body: 'You just arrived. Nobody knows your name yet, and that is exactly where everyone starts.', href: '' },
          { icon: 'Star', image: '', title: 'Initiate', body: 'One Journey finished. The practice is real now, not just an intention.', href: '' },
          { icon: 'Flame', image: '', title: 'Adept', body: 'Two Journeys finished. You know how to see something through and you keep showing up anyway.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Master', body: 'All three finished. Mind, Body, Spirit: you walked the whole season and capped each one.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tq-ranks-b',
        body: 'There is no threshold to cross and no one to beat. Finish one Journey and you are an Initiate. Finish two and you are Adept. Finish all three and you reach Master. The rank just follows the work. Every season resets, so each one is a fresh start and nobody is ever too far ahead to catch.',
        size: 'lg',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Statement',
      props: {
        id: 'tq-stmt-3',
        text: 'Not points to grind. A person to become.',
        accent: 'A person to become.',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── The single dark beat ── why the game is pointed where it is. Exactly one
    // ink section, near the end, before the close. ─────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tq-why-it-matters',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
        alt: 'People dancing together with arms raised at golden hour, faces lit and joyful',
        eyebrow: 'Why it points here',
        title: 'Most games waste your life. This one builds it.',
        titleAccent: 'builds it',
        kicker: '',
        body: "Every mechanic in the Quest answers to one rule: does this pull you toward real people, or deeper into a screen? The biggest rewards live off the phone, because Zaps come from being in the room. Ranks reset each season so it stays an open invitation, never a ladder you missed.\n\nWe are not building a better way to scroll. We are using the only thing screens are good at, the pull, and aiming it at the door, the Circle, and the practice you have been meaning to start.",
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
        id: 'tq-marquee',
        items: [
          { text: 'Sit for ten' },
          { text: 'Take the walk' },
          { text: 'Earn Zaps' },
          { text: 'Finish a Journey' },
          { text: 'Roll into Gems' },
          { text: 'Reach Master' },
        ],
        layout: L,
      },
    },

    // ── Close ── the one and only CTA on the page: Join the Beta. ───────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tq-cta',
        eyebrow: '',
        heading: 'Start your first season.',
        headingAccent: 'first season',
        body: 'Every player starts as a Ghost. Pick a Practice, log it, earn your first Zap, and watch the season open up. All it takes is a Circle and a standing time.',
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
