import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
  FOUNDING_PLACE,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE QUEST — regenerated onto the DAWN 2 block set (UX-MATURITY-PLAN Lift 5b),
// matching the pattern set by about.ts and the-lab.ts: one shared `L` layout
// literal, DAWN bands carrying the page's spine (Hero with the glass fact dock,
// StoryBeats on the reading measure, the ink ValueBand, the numbered
// BuildTimeline, the PillarNav triptych), and the product-story blocks kept where
// they are the truer expression (SeasonTimeline draws the 13-week shape and
// QuestLoop draws the 5:1 economy; no generic band draws either).
//
// COPY PROVENANCE (owner rule: default to what's on the site already). Every
// sentence here is lifted verbatim from something already published:
//  • the live template this replaces (the render path for /the-quest today), and
//  • the coded body in app/(marketing)/the-quest/page.tsx, from which THREE
//    sections are RECOVERED because the live page had quietly dropped them:
//      1. the answer-first FAQ (QUEST_FAQ) — the coded page emits its FAQPage
//         schema on BOTH branches, so today the schema describes five questions a
//         visitor cannot see. Google requires FAQ schema to match visible copy;
//         the Accordion block puts the questions back on the page (and owns its
//         own FAQPage node, per the block-schema precedent).
//      2. the rank TAGS ("Just arrived", "One Journey done", …), now riding the
//         BuildTimeline cards.
//      3. the PillarNav triptych, so The Quest links across to The Lab and The
//         Community the way its two siblings already do.
//  • the "You don't grind points…" paragraph from the coded premise section.
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
//  • The Vault = the member treasury. Amplitude = lifetime XP, never resets.
//  • Season ranks (completion-based): Ghost → Initiate → Adept → Master by
//    Journeys finished (0 / 1 / 2 / 3). Never "points," never a leaderboard.
//    No em dashes, sentence-case headings, honest at day zero (no member counts).
//
// HERO FACT DOCK: the three figures are the page's own, not new claims. Thirteen
// weeks and three Journeys are stated by the SeasonTimeline below; five to one is
// stated by the QuestLoop. Nothing in the dock is unsourced.
//
// RHYTHM: two mid-page dark beats (the ink ValueBand of keepsakes, the ink
// MediaText of why the game points where it does) plus the slat Marquee and the
// ink close, matching the coded page's own light↔dark cadence.
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
    // the game exists so the good habits actually stick. The DAWN fact dock hangs
    // the season's real shape over the seam. ───────────────────────────────────
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
        minHeight: 'auto',
        facts: [
          { value: '13', label: 'Weeks in a Quest' },
          { value: '3', label: 'Journeys a season' },
          { value: '5:1', label: 'Zaps into Gems' },
        ],
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

    // ── Why a game ── the purpose, said plainly, as ruled prose on the reading
    // measure (prose deserves a rule, not a box). The honesty wink lives here, and
    // the builder welcome: a space where we can all exist together. Continues the
    // hero band, so the dock and the first paragraph share one movement. ────────
    {
      type: 'StoryBeats',
      props: {
        id: 'tq-why',
        eyebrow: 'Why a game',
        kicker: 'A game is just the trick that gets you to keep showing up.',
        items: [
          {
            title: 'The point is the life, not the score.',
            body: "A good game knows how to pull you back: something to reach for, progress you can see, a reason to return tomorrow. Almost every game spends that pull on nothing. The Quest spends it on the things that build a life. Sit for ten minutes. Take the walk. Show up to the Circle on Tuesday.\n\nWe're not shy about it: a lot of the work is meditation and movement, the stuff people mean to do and never quite get to. Yes, it's meditation. We just made it a game so you'd actually do it. You do the real thing, the game keeps score of it, and the rest of us are right there with you. The Quest is a space where we can all exist together and back each other up, week after week.\n\nYou don't grind points. You build a reputation in a real place, with real people, who notice when you're there and feel it when you're not. The score is just a mirror held up to that.",
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
        id: 'tq-stmt-1',
        text: 'A streak you want to keep beats a resolution you forget.',
        accent: 'want to keep',
        tone: 'surface',
        layout: L,
      },
    },

    // ── SeasonTimeline ── the real shape of a Quest: thirteen weeks, three
    // Journeys (Mind, Body, Spirit), each capped by an Expression Challenge. Kept
    // as the product-story block: no generic band draws a sequenced track with a
    // capstone node on every leg. ──────────────────────────────────────────────
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
    // Vault. The economy, in four honest steps. Kept as the product-story block:
    // the loop is a drawn circuit, not a card row. ────────────────────────────
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
          { label: 'Earn Zaps', blurb: 'Every real act pays Zaps. No leaderboard, no streak to perform for a crowd.' },
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

    // ── What you earn ── the keepsakes, on the ink principles band with the sheen
    // pass: Pillar Trophies per Journey, the Certificate that caps the set, the
    // Vault, and Amplitude for the long haul. The page's first dark beat. ───────
    {
      type: 'ValueBand',
      props: {
        id: 'tq-earn',
        eyebrow: 'What you earn',
        title: 'Finish a Journey, keep the proof.',
        titleAccent: 'keep the proof',
        kicker: 'The Zaps and Gems are the currency. Trophies and the Certificate are the keepsakes.',
        columns: '2',
        items: [
          {
            icon: 'Zap',
            title: 'Zaps and Gems',
            body: 'Zaps come from real acts in person. Gems come from online activity and the season-end rollover. Both live in the Vault.',
          },
          {
            icon: 'Star',
            title: 'Pillar Trophies',
            body: 'Finish a Journey and you mint its Pillar Trophy, Mind, Body, or Spirit, plus 75 Zaps. Three Journeys, three Trophies.',
          },
          {
            icon: 'Sparkles',
            title: 'The Certificate',
            body: 'Finish all three and the Certificate caps the set: Master rank, a one-of-a-kind cosmetic, and 100 Gems. One per season.',
          },
          {
            icon: 'Flame',
            title: 'Amplitude',
            body: "Your lifetime total of every Zap you've ever earned. It never resets and never gets spent. It just keeps a record of the long haul.",
          },
        ],
        layout: L,
      },
    },

    // ── Ranks ── earned by finishing, not by score. Ghost to Master, as the DAWN
    // numbered milestone cards, each carrying the coded page's short qualifier. ──
    {
      type: 'BuildTimeline',
      props: {
        id: 'tq-ranks',
        eyebrow: 'Season ranks',
        title: 'You rank up by finishing, not by piling up points.',
        titleAccent: 'finishing',
        kicker: 'Your rank is simply how many Journeys you finished this season.',
        intro:
          "There's no threshold to cross and no one to beat. Finish one Journey and you're an Initiate. Finish two and you're Adept. Finish all three and you reach Master. The rank just follows the work. Every season resets, so each one is a fresh start and nobody is ever too far ahead to catch.",
        items: [
          {
            label: '01',
            title: 'Ghost',
            tag: 'Just arrived',
            body: "You just arrived. Nobody knows your name yet, and that's exactly where everyone starts.",
            highlight: 'normal',
          },
          {
            label: '02',
            title: 'Initiate',
            tag: 'One Journey done',
            body: 'One Journey finished. The practice is real now, not just an intention.',
            highlight: 'normal',
          },
          {
            label: '03',
            title: 'Adept',
            tag: 'Two Journeys done',
            body: 'Two Journeys finished. You know how to see something through and you keep showing up anyway.',
            highlight: 'normal',
          },
          {
            label: '04',
            title: 'Master',
            tag: 'Three Journeys done',
            body: 'All three finished. Mind, Body, Spirit: you walked the whole season and capped each one.',
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
    {
      type: 'Statement',
      props: {
        id: 'tq-stmt-3',
        text: 'Not a number to chase. A person to become.',
        accent: 'A person to become.',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Mid-page CTA ── the highest-intent moment: they have seen the season, the
    // loop, what they earn, and the ranks. Ask here. Not ink (the second dark beat
    // is below, before the close). ─────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tq-cta-mid',
        eyebrow: '',
        heading: 'Start your first season.',
        headingAccent: 'first season',
        body: `You've seen the season, the loop, and the ranks. Every player starts as a Ghost, and the founding members are climbing it together in ${FOUNDING_PLACE}. Pick a Practice and log your first Zap.`,
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

    // ── The second dark beat ── why the game is pointed where it is, before the
    // slat marquee and the close. Striking achievement image. ──────────────────
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
        body: "Every mechanic in the Quest answers to one rule: does this pull you toward real people, or deeper into a screen? The biggest rewards live off the phone, because Zaps come from being in the room. Ranks reset each season so it stays an open invitation, never a train that left without you.\n\nWe're not building a better way to scroll. We're using the only thing screens are good at, the pull, and aiming it at the door, the Circle, and the practice you've been meaning to start.",
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

    // ── The short answers ── RECOVERED from the coded body. The route emits
    // FAQPage schema on both branches, so these five questions have to be on the
    // page for the structured data to be honest. Verbatim from QUEST_FAQ; the
    // Accordion block owns its own FAQPage node. ───────────────────────────────
    {
      type: 'Accordion',
      props: {
        id: 'tq-faq',
        eyebrow: 'Questions',
        title: 'The short answers.',
        titleAccent: '',
        items: [
          {
            q: 'How does The Quest work?',
            a: 'The Quest is a light game built into Frequency. You earn Zaps for showing up in person and Gems for keeping your Circle warm online, run three Journeys each season for Mind, Body, and Spirit, and rise through the ranks by finishing the work.',
          },
          {
            q: 'What are Zaps and Gems?',
            a: 'Zaps are earned in person for real acts like showing up, hosting, or bringing someone new. Gems are earned online for the small acts that keep a Circle alive between gatherings. At season end Zaps roll into Gems at five to one, and Gems are spent in the Vault.',
          },
          {
            q: 'What are the season ranks?',
            a: 'The ranks are Ghost, Initiate, Adept, and Master. Your rank is simply how many Journeys you finished this season: zero makes you a Ghost, one an Initiate, two an Adept, and all three a Master. There is no points threshold, and ranks reset each season.',
          },
          {
            q: 'What is a Journey?',
            a: 'A Journey is a focused track that runs about four weeks, one each for Mind, Body, and Spirit. Each closes with an Expression Challenge where you share what you practiced. Finish a Journey and you earn a Pillar Trophy; finish all three and you reach Master.',
          },
          {
            q: 'Do I have to pay to play The Quest?',
            a: 'No. The community and The Quest are free to play, and everyone earns at full rate. Membership keeps open the rooms The Quest fills, and you never pay a cut of your own bookings. You are not buying points.',
          },
        ],
        emphasis: { scale: 'default', accent: 'none' },
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The triptych cross-link ── RECOVERED from the coded body, so The Quest
    // sits alongside The Lab and The Community the way its siblings already do. ──
    {
      type: 'PillarNav',
      props: {
        id: 'tq-pillars',
        current: '/the-quest',
        tone: 'surface',
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
        emphasis: { scale: 'default', accent: 'none' },
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
