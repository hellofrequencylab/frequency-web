import type { Data } from '@/lib/page-editor/types'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT — the DAWN 2 rebuild, expressed in blocks (owner directive: the template
// IS the page). Mirrors the coded rebuild in app/(marketing)/about/page.tsx
// (commit 6395fe4, itself built to design_handoff/dawn/ui_kits/marketing/
// about.html): the photographic hero with the glass fact dock, the rule-amber
// story beats on the reading measure, one PhotoBeat, the ink principles band,
// the arc-top figure row, the numbered asks, and the dark close. Same structure,
// same copy — the template render and the coded fallback are visually equivalent.
//
// CONTRACT:
//  • One `const L` layout literal, reused on every block so the rhythm stays even.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    verbatim (Circle, Journey, Frequency Lab). No em dashes. Sentence-case
//    headings. Contractions always. Honest at day zero: the only numbers are the
//    real story's (2020, a thousand at sunrise, 0% on your own bookings).
//  • Movement-register language stays RATIONED (CONTENT-VOICE §6d): the one
//    rationed line rides the PhotoBeat.
//  • CTA SYSTEM: the hero carries the Seeker entry (/start); the closing ink
//    CallToAction carries the shared beta CTA. Never stack two buttons.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── photographic, with the glass fact dock overhanging the seam. ────
    {
      type: 'Hero',
      props: {
        id: 'ab-hero',
        variant: 'image',
        eyebrow: 'Our story',
        title: 'The third place is gone. We hand people the tools to bring it back.',
        titleAccent: '',
        subtitle:
          "It started on a beach in 2020: no guru, no brand, just a thousand strangers who needed each other. We learned what it takes to make that last. Now we put it in the hands of the people who start the next one.",
        image: '/images/site/moonlight-1.jpg',
        focal: 'center',
        minHeight: 'auto',
        facts: [
          { value: '2020', label: 'A cliff at dawn' },
          { value: '1,000', label: 'Strangers at sunrise' },
          { value: '0%', label: 'On your own bookings' },
        ],
        ctaPrimaryLabel: 'Find your way in',
        ctaPrimaryHref: '/start',
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        note: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── The story, told in beats separated by the warm hairline. Prose deserves
    // a rule, not a box (DAWN about.html). Continues past the hero dock. ────────
    {
      type: 'StoryBeats',
      props: {
        id: 'ab-story',
        eyebrow: 'Where it comes from',
        kicker: 'Most of a generation feels it. Almost nobody has a word for it.',
        items: [
          {
            title: 'A hunger nobody could name.',
            body: "We didn't set out to start a company. We set out to find each other, and discovered that the places built to hold people had quietly disappeared.\n\nThe corner café, the town square, the gathering ground: the third spaces that aren't home and aren't work, where you're known by name and missed when you don't show up. We traded them for feeds and followers, ended up surrounded yet unseen, and felt the loss long before we could explain it. No company is going to hand the third place back. People rebuild it, one Circle at a time, and it began the only honest way it could: with a handful of people on a cliff at dawn.",
          },
          {
            title: 'It started on a cliff at dawn.',
            body: `In a season when everyone felt cut off, a few people in ${FOUNDING_PLACE} started meeting on the bluffs above Moonlight Beach. Just breath, cold air, and each other: no membership, no marketing, no one in charge.\n\nWord got out the way real things do: one person bringing another. Within eighteen months, close to a thousand people were showing up to breathe together at sunrise, drawn by nothing but a hunger for something real that none of them could quite name.`,
          },
          {
            title: 'No stage. No followers. Just a circle.',
            body: "There was no guru on a stage and no audience in rows. People sat in a circle on the grass, passed instruments around, moved and breathed and actually talked. The point was never to watch someone perform belonging. It was to practice it together.\n\nThat shape mattered more than we understood at the time. A leader you follow can leave, burn out, or let you down. A circle holds itself. The thing we'd stumbled into wasn't a following at all. It was a community that could carry its own weight.",
          },
          {
            title: 'And then it fell apart.',
            body: "A thousand people, and nowhere to put them. No home, no infrastructure, no way to hold what had been built. It ran entirely on a few people's energy, and energy runs out. When it faded, it faded fast.\n\nBut it left something behind: a painfully clear picture of exactly what to build so that next time, it could last. Not more hype. Not a bigger personality. A format anyone can run, a model that doesn't depend on anyone's stamina, a way to stay open to everyone, and a real home to grow into.",
          },
        ],
        flow: 'cont',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── The mission, carried by a photograph. The one rationed movement line. ───
    {
      type: 'PhotoBeat',
      props: {
        id: 'ab-beat',
        image: '/images/site/adult-playground-parachute.jpg',
        alt: 'Adults holding the edges of a parachute together on a sunny lawn',
        eyebrow: 'Why we exist',
        line: 'Somewhere to belong, near you.',
        lineAccent: 'near you',
        note: "We think the answer to the loneliest era in history is a folding chair with your name on it. We're not building a following. We're building infrastructure.",
        focal: 'center',
        layout: L,
      },
    },

    // ── What we believe — the principles, on the ink band. ─────────────────────
    {
      type: 'ValueBand',
      props: {
        id: 'ab-values',
        eyebrow: 'What we believe',
        title: "The principles we won't trade away.",
        titleAccent: '',
        kicker: 'Four hard rules, learned the hard way.',
        columns: '2',
        items: [
          {
            icon: 'Compass',
            title: 'Guru-free',
            body: "No charismatic founder to follow, no one to put on a pedestal. The community is the point, not any single voice at the front of the room. A real person started this, and it's built to not need him.",
          },
          {
            icon: 'Users',
            title: 'Leaderful, not leader-dependent',
            body: "Everyone holds a piece of it. Leaders rise from the people who keep showing up. Designed to outlast any one person, so it can't collapse the moment a few people get tired.",
          },
          {
            icon: 'HandHeart',
            title: 'One honest price',
            body: 'Zero percent on your own bookings, always, and taking money is never behind a plan. We earn only a small, shrinking cut on the business the network sends you. One price, no surprise invoices, and your data leaves with you any month you want.',
          },
          {
            icon: 'Home',
            title: 'A third place',
            body: "Not home, not work: a real place to exhale, reset, and be missed when you don't show up. Built to be returned to, not scrolled past.",
          },
        ],
        layout: L,
      },
    },

    // ── The arc — cream rises back out of the ink on the shoulder. ─────────────
    {
      type: 'PhotoTrio',
      props: {
        id: 'ab-arc',
        eyebrow: 'The arc',
        title: 'From a beach to your city.',
        titleAccent: '',
        kicker: 'One circle at a time, the way it always spread.',
        intro: '',
        items: [
          {
            image: '/images/site/moonlight-2.jpg',
            alt: 'A gathering on the bluffs at Moonlight Beach at sunrise',
            title: '2020 · A cliff at Moonlight Beach',
            caption:
              'A handful of people start meeting at dawn to breathe and reconnect. No brand, no plan, just a standing time and a place to be.',
          },
          {
            image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
            alt: 'People in a quiet moment of breathwork together outdoors at golden hour',
            title: '2021 · A thousand people, no home',
            caption:
              "Word of mouth carries it to nearly a thousand. It proves the hunger is real, and proves that without a home, even the most beautiful thing can't hold.",
          },
          {
            image: '/images/site/lab-storefront.jpg',
            alt: 'The storefront of the first Frequency Lab taking shape',
            title: `Today · Founding in ${FOUNDING_PLACE}`,
            caption:
              'The blueprint becomes real: the tools handed to anyone who wants to start a Circle, a physical home taking root, and a model that keeps the doors open to everyone. The first Circles are forming.',
          },
        ],
        footnote:
          'Next, it spreads the only way it ever has: person to person, circle to circle, city by city, following the people who start them.',
        shape: 'arc',
        texture: 'dots',
        tone: 'surface',
        layout: L,
      },
    },

    // ── What we hand you — the rebuild, said as three plain things. ────────────
    {
      type: 'BuildTimeline',
      props: {
        id: 'ab-asks',
        eyebrow: 'Why the rebuild is deliberate',
        title: "We're handing it back to ordinary people.",
        titleAccent: '',
        kicker: 'Not recreating a moment. Building the foundations the first one never had.',
        intro: '',
        items: [
          {
            label: '01',
            title: 'The first-night script',
            body: "You don't have to build a community from scratch. You set out the chairs for one Circle, and we hand you the rest.",
            highlight: 'normal',
          },
          {
            label: '02',
            title: 'A structure past week three',
            body: "The simple structure that keeps a group alive past week three, and a model that doesn't depend on anyone's stamina.",
            highlight: 'normal',
          },
          {
            label: '03',
            title: 'A Journey and a bench',
            body: 'A Journey to walk together over a season, and a bench of people who have done it before.',
            highlight: 'normal',
          },
        ],
        footnote: '',
        texture: 'none',
        flow: 'soft',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── Close — the dark beat, the one button on the page. ─────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'ab-cta',
        eyebrow: '',
        heading: 'Be one of the first.',
        headingAccent: '',
        body: "This time it gets a home, and it gets you. Pick your way in, and we'll point you at the first move.",
        ctaPrimaryLabel: BETA_CTA_LABEL,
        ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        emphasis: { scale: 'default', accent: 'none' },
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },
  ],
}
