import type { Data } from '@measured/puck'

export const data: Data = {
  root: {},
  content: [
    // ── Hero ─────────────────────────────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'about-hero',
        variant: 'image',
        eyebrow: 'Our story',
        title: "We're building the place we wished existed.",
        titleAccent: '',
        subtitle:
          "It started on a beach in 2020. No guru, no brand, just a thousand strangers who needed each other. This is how it became a blueprint for doing it right.",
        image: '/images/site/moonlight-1.jpg',
        focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: 'Join the Beta',
        ctaPrimaryHref: '/beta',
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        note: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The hunger — heading ──────────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'about-hunger-heading',
        eyebrow: 'Where it comes from',
        title: 'A hunger nobody could name.',
        titleAccent: '',
        kicker: 'Most of a generation feels it. Almost nobody has a word for it.',
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The hunger — body ─────────────────────────────────────────────────────
    {
      type: 'Text',
      props: {
        id: 'about-hunger-body',
        body: "We didn't set out to start a company. We set out to find each other, and discovered that the places built to hold people had quietly disappeared.\n\nThe corner café, the town square, the gathering ground: the third spaces that aren't home and aren't work, where you're known by name and missed when you don't show up. We traded them for feeds and followers, ended up surrounded yet unseen, and felt the loss long before we could explain it. Frequency is our answer to that ache, and it began the only honest way it could: with a handful of people on a cliff at dawn.",
        size: 'lg',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── It started on a cliff ─────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'about-cliff-at-dawn',
        image: '/images/site/moonlight-2.jpg',
        alt: 'A gathering on the bluffs at Moonlight Beach at sunrise',
        eyebrow: '2020 · Moonlight Beach',
        title: 'It started on a cliff at dawn.',
        titleAccent: '',
        kicker: '',
        body: "In a season when everyone felt cut off, a few people in North County San Diego started meeting on the bluffs above Moonlight Beach. Just breath, cold air, and each other. No membership, no marketing, no one in charge.\n\nWord got out the way real things do: one person bringing another. Within eighteen months, close to a thousand people were showing up to breathe together at sunrise, drawn by nothing but a hunger for something real that none of them could quite name.",
        side: 'right',
        imgAspect: 'portrait',
        focal: 'top',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Statement 1 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'about-statement-1',
        text: 'It proved the hunger is enormous.',
        accent: 'enormous',
        tone: 'surface',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── No stage, no followers ────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'about-circle-not-stage',
        image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A music circle gathered on the cliffside above the ocean at golden hour',
        eyebrow: 'What it felt like',
        title: 'No stage. No followers. Just a circle.',
        titleAccent: '',
        kicker: '',
        body: "There was no guru on a stage and no audience in rows. People sat in a circle on the grass, passed instruments around, moved and breathed and actually talked. The point was never to watch someone perform belonging. It was to practice it together.\n\nThat shape mattered more than we understood at the time. A leader you follow can leave, burn out, or let you down. A circle holds itself. The thing we'd stumbled into wasn't a following at all. It was a community that could carry its own weight.",
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── And then it fell apart ────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'about-fell-apart',
        image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'People in a quiet moment of breathwork together outdoors at golden hour',
        eyebrow: 'The hard part',
        title: 'And then it fell apart.',
        titleAccent: '',
        kicker: '',
        body: "A thousand people, and nowhere to put them. No home, no infrastructure, no way to hold what had been built. It ran entirely on a few people's energy, and energy runs out. When it faded, it faded fast.\n\nBut it left something behind: a painfully clear picture of exactly what to build so that next time, it could last. Not more hype. Not a bigger personality. A real home, a model that doesn't depend on anyone's stamina, and a way to stay open to everyone.",
        side: 'right',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Statement 2 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'about-statement-2',
        text: 'This time it gets a home.',
        accent: 'home',
        tone: 'ink',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── What we believe — heading ─────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'about-values-heading',
        eyebrow: 'What we believe',
        title: "The principles we won't trade away.",
        titleAccent: '',
        kicker: 'Four hard rules, learned the hard way.',
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Values — FeatureGrid ──────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'about-values-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'icon',
        columns: '2',
        items: [
          {
            icon: 'Compass',
            image: '',
            title: 'Guru-free',
            body: "No charismatic founder to follow, no one to put on a pedestal. The community is the point, not any single voice at the front of the room.",
            href: '',
          },
          {
            icon: 'Users',
            image: '',
            title: 'Leaderful, not leader-dependent',
            body: "Everyone holds a piece of it. Designed to outlast any one person, so it can't collapse the moment a few people get tired.",
            href: '',
          },
          {
            icon: 'Heart',
            image: '',
            title: 'Pay-it-forward',
            body: "Circulation, not exclusion. People who can give more keep the doors open for people who can't. Nobody is priced out of belonging.",
            href: '',
          },
          {
            icon: 'MapPin',
            image: '',
            title: 'A third space',
            body: "Not home, not work. A real place to exhale, reset, and be missed when you don't show up. Built to be returned to, not scrolled past.",
            href: '',
          },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── A place to be human ───────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'about-why-we-exist',
        image: '/images/site/community-1.jpg',
        alt: 'A Frequency community gathered together outdoors, talking and laughing',
        eyebrow: 'Why we exist',
        title: 'A place to be human.',
        titleAccent: '',
        kicker: '',
        body: "Frequency exists to rebuild the third space: real physical homes for connection, backed by a community designed to last, and kept open to anyone regardless of what they can pay.\n\nWe're not building a following. We're building infrastructure: the kind of thing you can lean your whole weight on and trust to still be standing next year. A place where showing up is easy, being known is the default, and nobody gets left at the door.",
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Pull quote ────────────────────────────────────────────────────────────
    {
      type: 'Quote',
      props: {
        id: 'about-pull-quote',
        variant: 'pull',
        quote: "We don't want to be followed. We want to be joined.",
        accentWord: 'joined',
        attribution: 'The Frequency founding circle',
        role: '',
        avatar: '',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The arc — timeline heading ────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'about-timeline-heading',
        eyebrow: 'The arc',
        title: 'From a beach to your city.',
        titleAccent: '',
        kicker: 'One circle at a time, the way it always spread.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Timeline — Accordion ──────────────────────────────────────────────────
    {
      type: 'Accordion',
      props: {
        id: 'about-timeline-accordion',
        eyebrow: '',
        title: '',
        titleAccent: '',
        items: [
          {
            q: '2020: A cliff at Moonlight Beach',
            a: "A handful of people start meeting at dawn to breathe and reconnect. No brand, no plan, just a standing time and a place to be.",
          },
          {
            q: '2021: A thousand people, no home',
            a: "Word of mouth carries it to nearly a thousand. It proves the hunger is real, and proves that without a home, even the most beautiful thing can't hold.",
          },
          {
            q: 'Today: Founding in North County San Diego',
            a: "The blueprint becomes real: a physical home, a community built to last, and a model that keeps the doors open to everyone. The first circles are taking root.",
          },
          {
            q: 'Next: Coming to your city',
            a: "It spreads the only way it ever has, person to person, circle to circle, city by city. Add your name and help us choose where it seeds next.",
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Built to outlast any one person ──────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'about-built-to-outlast',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
        alt: 'A Frequency community celebrating and dancing together at golden hour',
        eyebrow: 'What lasts',
        title: 'Built to outlast any one person.',
        titleAccent: '',
        kicker: '',
        body: "The mistake we never want to repeat is letting it ride on a few people's energy. So everything about Frequency is designed to keep standing on its own: the spaces, the model, the way circles form and carry themselves.\n\nThat's the whole point of starting again, deliberately, in North County San Diego. Not to recreate a moment, but to give it the foundations the first one never had, and to keep real connection within reach for everyone, not just the few who can afford it.",
        side: 'right',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Statement 3 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'about-statement-3',
        text: "We're not building a following. We're building infrastructure.",
        accent: 'infrastructure',
        tone: 'surface',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── CTA ──────────────────────────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'about-cta',
        eyebrow: '',
        heading: 'Be one of the first.',
        headingAccent: '',
        body: "This time it gets a home. Add your name and help us build it right: a Circle to call yours, and a place to be human, together.",
        ctaPrimaryLabel: 'Join the Beta',
        ctaPrimaryHref: '/beta',
        ctaSecondaryLabel: '',
        ctaSecondaryHref: '',
        tone: 'ink',
        width: 'default',
        align: 'center',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },
  ],
}
