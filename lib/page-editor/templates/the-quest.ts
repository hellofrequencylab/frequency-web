import type { Data } from '@measured/puck'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE QUEST — the explainer for the practice game. Built to the exemplar shape
// in the-community.ts: one shared `L` layout literal, an alternating tone beat
// with `Statement` interstitials between movements, exactly ONE dark `ink` beat
// near the end, and the CTA system from The Community (a primary that appears at
// the hero, a mid-page CallToAction at the highest-intent moment, and the ink
// close, each carrying ONE quiet secondary text link).
//
// What this page does: opens on PURPOSE, not mechanics. The Quest is meditation
// and movement dressed as a game, on purpose, so people actually do the thing
// (CONTENT-VOICE §6e: "Yes, it's meditation. We just made it a game so you'd
// actually do it."). Then it shows the real shape: a thirteen-week season of
// three Journeys (Mind, Body, Spirit), each capped by an Expression Challenge;
// the Practices you log; the Mindless timer; the Zaps and Gems and Trophies and
// the Certificate you earn; the Vault you spend in; the ranks you climb by
// finishing. It also carries the builder welcome: a space where we can all exist
// together and support each other. Light/Duolingo tone is allowed here; the
// magic stays in the proper nouns and the sentences stay plain.
//
// Canon rendered verbatim (docs/NAMING.md):
//  • The Quest = the year-round game; a Quest = one 13-week season. Hierarchy:
//    The Quest → a Quest (season) → Journey → Practice.
//  • Three Journeys per Quest, one each Mind → Body → Spirit (~4 weeks each), run
//    in sequence, each capped by ONE Expression Challenge. Expression is NOT a
//    fourth Journey; it is the capstone.
//  • Practice = the atomic real-world act; weight classes light / standard /
//    heavy. Mindless = the one timer; its two modes are Be Still / Get Moving.
//  • Zaps earned in person for real acts; Gems earned online + from the rollover.
//    Zaps roll into Gems FLAT at 5:1 at season end, spent in the Vault.
//  • Finishing a Journey mints a Pillar Trophy (+75 Zaps). Finishing all three
//    caps the set with the Certificate (Master rank + a cosmetic + 100 Gems).
//  • The Vault = the member treasury (Gems, Zaps, and Awards: Trophies + the
//    Certificate). Amplitude = lifetime XP, never resets, never spent.
//  • Season ranks (completion-based): Ghost → Initiate → Adept → Master by
//    Journeys finished (0 / 1 / 2 / 3). Never "points," never "cohort," never a
//    leaderboard to climb. No em dashes, sentence-case headings, honest at day
//    zero (no member counts, no invented numbers).
//
// CTA SYSTEM: the primary action is BETA_CTA_LABEL ("Start a Circle"), with its
// quiet secondary (BETA_CTA_SECONDARY_LABEL, "or just join as a member"). Never
// stack two buttons; the secondary is a text link, not a button.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the one big promise, and the first place to act. Purpose first:
    // the game exists so the good habits actually stick. Atmospheric, not a
    // crowd shot. ───────────────────────────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'tq-hero',
        variant: 'image',
        eyebrow: 'The Quest',
        title: 'We made the good habits a game so people actually do them.',
        titleAccent: 'a game',
        subtitle:
          "Yes, a lot of it is meditation and movement. We know how that lands. So we built a game around it, because a streak you want to keep beats a resolution you forget by February.",
        image: '/images/site/sunset.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL,
        ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        note: "We're just opening. The first players are setting the tone.",
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── Why a game ── the purpose, said plainly. The honesty wink lives here, and
    // the builder welcome: a space where we can all exist together. ─────────────
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
        body: "A good game knows how to pull you back: something to climb, progress you can see, a reason to return tomorrow. Almost every game spends that pull on nothing. The Quest spends it on the things that build a life. Sit for ten minutes. Take the walk. Show up to the Circle on Tuesday.\n\nWe're not shy about it: a lot of the work is meditation and movement, the stuff people mean to do and never quite get to. Yes, it's meditation. We just made it a game so you'd actually do it. You do the real thing, the game keeps score of it, and the rest of us are right there with you. The Quest is a space where we can all exist together and back each other up, week after week.",
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
            blurb: 'Meditation, breathwork, and the quiet practices that calm you down. The first leg of the season.',
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
        capstoneNote: "Expression isn't a fourth Journey. It's the Challenge that closes each leg: make something, share it with your people, and finish the Journey. Three Journeys, three Challenges, one season. A new Quest drops with each season: Stretch in summer, Shed in autumn, Sit in winter, Sprout in spring.",
        tone: 'canvas',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── Practices ── the atomic real-world act. What you actually log. Playful
    // lawn shot for the "small real acts" beat. ────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tq-practices',
        image: '/images/site/hula-hoop-party.jpg',
        alt: 'A group playing with hula hoops together on a sunny lawn',
        eyebrow: 'Practices',
        title: 'Small real acts, one at a time.',
        titleAccent: 'small real acts',
        kicker: 'A Practice is the smallest unit of the game: one real thing you did.',
        body: "A Practice is a single real-world act. Sit for ten minutes. Take the cold plunge. Walk while you call your mother. Each Journey is built from a handful of them, and you log them as you go.\n\nPractices come in three weight classes: light, standard, and heavy. A two-minute breath is light. A long Saturday hike is heavy. The heavier the act, the more Zaps it pays, so the game leans you toward the things that take a little more of you.",
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

    // ── Mindless ── the one timer; two modes only. Portrait shot: a quiet moment,
    // phones down, watching the sun go down together. ───────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tq-mindless',
        image: '/images/site/nature-viewing-sunset.jpg',
        alt: 'A few people standing at a railing, watching a pink sunset over the ocean',
        eyebrow: 'Mindless',
        title: 'Get out of your head, and into your life.',
        titleAccent: 'into your life',
        kicker: 'One timer, two modes. The screen exists only to let you put the phone down.',
        body: "Mindless is the timer you run a Practice on. It has two modes. **Be Still** is the quiet sit: meditate, breathe, journal, or just log the minutes. **Get Moving** is the moving one: walk, run, yoga, strength, stretch, play.\n\nYou tune out to start, tune back in when you're done, and the time you gave counts. That's the whole design. The point of the screen is to make it easy to stop looking at the screen.",
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
        title: "Show up. That's the whole game.",
        titleAccent: 'Show up',
        kicker: 'Real acts earn Zaps. At season end they roll into Gems you can spend.',
        stages: [
          { label: 'Show up', blurb: 'Log a Practice, finish a Challenge, take on a Task. In person counts most.' },
          { label: 'Earn Zaps', blurb: 'Every real act pays Zaps. No leaderboard to climb, no streak to perform for a crowd.' },
          { label: 'Roll into Gems', blurb: 'At season end your Zaps convert to Gems at a flat five to one.' },
          { label: 'Spend in the Vault', blurb: 'Gems are yours to spend in the Vault, the member treasury where rewards live.' },
        ],
        ratioNote: 'The rate is fixed and flat: five Zaps become one Gem at the close of every season. The game is free, the same for everyone, and you only ever earn it by turning up. No points, no pay to win. Earn online and you bank Gems directly; everything else rolls in at season end.',
        tone: 'canvas',
        width: 'wide',
        align: 'left',
        layout: L,
      },
    },

    // ── What you earn ── the keepsakes: Pillar Trophies per Journey, the
    // Certificate that caps the set, the Vault, and Amplitude for the long haul. ─
    {
      type: 'Heading',
      props: {
        id: 'tq-earn-h',
        eyebrow: 'What you earn',
        title: 'Finish a Journey, keep the proof.',
        titleAccent: 'keep the proof',
        kicker: 'The Zaps and Gems are the currency. Trophies and the Certificate are the keepsakes.',
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
        id: 'tq-earn-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'Zap', image: '', title: 'Zaps and Gems', body: 'Zaps come from real acts in person. Gems come from online activity and the season-end rollover. Both live in the Vault.', href: '' },
          { icon: 'Star', image: '', title: 'Pillar Trophies', body: 'Finish a Journey and you mint its Pillar Trophy, Mind, Body, or Spirit, plus 75 Zaps. Three Journeys, three Trophies.', href: '' },
          { icon: 'Sparkles', image: '', title: 'The Certificate', body: 'Finish all three and the Certificate caps the set: Master rank, a one-of-a-kind cosmetic, and 100 Gems. One per season.', href: '' },
          { icon: 'Flame', image: '', title: 'Amplitude', body: "Your lifetime total of every Zap you've ever earned. It never resets and never gets spent. It just keeps a record of the long haul.", href: '' },
        ],
        tone: 'surface',
        width: 'default',
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
        tone: 'canvas',
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
          { icon: 'Compass', image: '', title: 'Ghost', body: "You just arrived. Nobody knows your name yet, and that's exactly where everyone starts.", href: '' },
          { icon: 'Star', image: '', title: 'Initiate', body: 'One Journey finished. The practice is real now, not just an intention.', href: '' },
          { icon: 'Flame', image: '', title: 'Adept', body: 'Two Journeys finished. You know how to see something through and you keep showing up anyway.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Master', body: 'All three finished. Mind, Body, Spirit: you walked the whole season and capped each one.', href: '' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tq-ranks-b',
        body: "There's no threshold to cross and no one to beat. Finish one Journey and you're an Initiate. Finish two and you're Adept. Finish all three and you reach Master. The rank just follows the work. Every season resets, so each one is a fresh start and nobody is ever too far ahead to catch.",
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
        id: 'tq-stmt-3',
        text: 'Not points to grind. A person to become.',
        accent: 'A person to become.',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Mid-page CTA ── the highest-intent moment: they have seen the season, the
    // loop, what they earn, and the ranks. Ask here. Not ink (the single dark
    // beat is below, before the close). ────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tq-cta-mid',
        eyebrow: '',
        heading: 'Start your first season.',
        headingAccent: 'first season',
        body: "You've seen the season, the loop, and the ranks. Every player starts as a Ghost. Pick a Practice and log your first Zap.",
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

    // ── The single dark beat ── why the game is pointed where it is. Exactly one
    // ink section, near the end, before the close. Striking achievement image. ──
    {
      type: 'MediaText',
      props: {
        id: 'tq-why-it-matters',
        image: '/images/site/hand-stand.jpg',
        alt: 'A man holding a handstand on the beach beside a palm tree',
        eyebrow: 'Why it points here',
        title: 'Most games waste your life. This one builds it.',
        titleAccent: 'builds it',
        kicker: '',
        body: "Every mechanic in the Quest answers to one rule: does this pull you toward real people, or deeper into a screen? The biggest rewards live off the phone, because Zaps come from being in the room. Ranks reset each season so it stays an open invitation, never a ladder you missed.\n\nWe're not building a better way to scroll. We're using the only thing screens are good at, the pull, and aiming it at the door, the Circle, and the practice you've been meaning to start.",
        side: 'right',
        imgAspect: 'portrait',
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
          { text: 'Mint a Trophy' },
          { text: 'Reach Master' },
        ],
        layout: L,
      },
    },

    // ── Close ── the ink CTA. Primary action plus the quiet member path. ─────────
    {
      type: 'CallToAction',
      props: {
        id: 'tq-cta',
        eyebrow: '',
        heading: 'Play the game that builds a life.',
        headingAccent: 'builds a life',
        body: 'Every player starts as a Ghost. Pick a Practice, log it, earn your first Zap, and watch the season open up. All it takes is a Circle and a standing time, and a few people to do it with.',
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
