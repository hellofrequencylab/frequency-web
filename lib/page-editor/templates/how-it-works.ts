import type { Data } from '@measured/puck'

export const data: Data = {
  root: {},
  content: [
    // ── Hero ─────────────────────────────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'hiw-hero',
        variant: 'image',
        eyebrow: 'How it works',
        title: 'Community with a shape.',
        titleAccent: '',
        subtitle:
          "Most communities are a feed and a hope. Frequency has a structure that actually grows, and it only takes two words to belong.",
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
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

    // ── Three steps — heading ────────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'hiw-steps-heading',
        eyebrow: 'From the people, not the org chart',
        title: 'Three steps to belong.',
        titleAccent: '',
        kicker: "No application. No audition. Two words and you're in the room.",
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Three steps — FeatureGrid ────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'hiw-steps-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'number',
        columns: '3',
        items: [
          {
            icon: 'Compass',
            image: '',
            title: 'Pick what you practice',
            body: 'Choose a Channel: movement, breathwork, holistic health, creativity, human relating. It\'s the thread that ties you to people who care about the same thing.',
            href: '',
          },
          {
            icon: 'Users',
            image: '',
            title: 'Join a Circle',
            body: 'Find your people near you. A small group built around your Channel, with an always-on virtual space and a standing time to meet in person.',
            href: '',
          },
          {
            icon: 'CalendarDays',
            image: '',
            title: 'Show up',
            body: "That's the whole secret. Small enough that you're missed when you don't come, so showing up stops feeling like effort and starts feeling like home.",
            href: '',
          },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Interests and Circles ────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'hiw-interests-circles',
        image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'A Frequency Circle gathered for breathwork outdoors',
        eyebrow: 'Where you belong',
        title: 'Channels and Circles',
        titleAccent: '',
        kicker: 'Two words are all it takes to find your place.',
        body: "A **Channel** is what you practice: movement, breathwork, holistic health, creativity, human relating. It connects you to people everywhere who care about the same things you do.\n\nA **Circle** is your people, near you. A small group built around a Channel, with an always-on virtual space, and often a standing time to meet in person. Small enough that you're missed when you don't show up.",
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

    // ── Statement 1 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'hiw-statement-1',
        text: 'Two words are all you need to belong.',
        accent: 'belong',
        tone: 'surface',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── It spreads like cells ────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'hiw-cells-not-franchises',
        image: '/images/site/PHOTO-2020-09-09-16-38-27.jpeg',
        alt: 'A large Frequency community practicing yoga together on a lawn',
        eyebrow: 'How it grows',
        title: 'It spreads like cells, not franchises.',
        titleAccent: '',
        kicker: '',
        body: "Circles are designed to divide. When one fills up, it doesn't put people on a waitlist. It seeds a new Circle, led by someone who was ready to step up.\n\nA handful of neighbouring Circles becomes a neighborhood. Neighborhoods become a whole local community. None of it is appointed from above. It grows on its own momentum, the way real things do.",
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

    // ── The shape of it — heading ────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'hiw-shape-heading',
        eyebrow: 'The shape of it',
        title: 'From one circle to a whole community.',
        titleAccent: '',
        kicker: 'Nobody hands it down. It grows from the inside out.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The shape — FeatureGrid ──────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'hiw-shape-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'icon',
        columns: '3',
        items: [
          {
            icon: 'Users',
            image: '',
            title: 'A Circle',
            body: 'A handful of neighbors around one Channel. The smallest unit that can hold you.',
            href: '',
          },
          {
            icon: 'MapPin',
            image: '',
            title: 'A neighborhood',
            body: 'Circles that divide and multiply until your corner of the map is full of them.',
            href: '',
          },
          {
            icon: 'Leaf',
            image: '',
            title: 'A community',
            body: 'A whole local ecosystem: leaderful, self-sustaining, grown rather than built.',
            href: '',
          },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Guru-free ────────────────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'hiw-guru-free',
        image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A Frequency music circle gathered on a cliffside at golden hour',
        eyebrow: 'Why it lasts',
        title: 'Guru-free. By design.',
        titleAccent: '',
        kicker: '',
        body: "Communities built around one charismatic founder live and die with that person. We've all watched it happen. So Frequency is built to be the opposite: leaderful, not leader-dependent.\n\nLeaders rise from showing up, not from being anointed. Take the same structure away from any one of us and it keeps running, because the practices, the places, and the people were the point all along.",
        side: 'right',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'ink',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Marquee ──────────────────────────────────────────────────────────────
    {
      type: 'Marquee',
      props: {
        id: 'hiw-marquee',
        items: [
          { text: 'Pick what you practice' },
          { text: 'Join a Circle' },
          { text: 'Show up' },
          { text: "Be missed when you don't" },
          { text: 'Lead by showing up' },
          { text: 'Pay it forward' },
        ],
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── What holds it together — heading ─────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'hiw-holds-heading',
        eyebrow: 'What holds it together',
        title: 'Leaderful, not leader-dependent.',
        titleAccent: '',
        kicker: '',
        size: 'default',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── What holds it together — FeatureGrid ─────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'hiw-holds-grid',
        eyebrow: '',
        title: '',
        titleAccent: '',
        style: 'icon',
        columns: '3',
        items: [
          {
            icon: 'CalendarDays',
            image: '',
            title: 'Small and standing',
            body: 'Circles stay small on purpose. A standing time, the same faces, and the quiet accountability of being noticed.',
            href: '',
          },
          {
            icon: 'Leaf',
            image: '',
            title: 'Earned, not appointed',
            body: 'Leaders rise from showing up and looking after the people around them, never from being anointed from above.',
            href: '',
          },
          {
            icon: 'Heart',
            image: '',
            title: 'Pay it forward',
            body: 'When you can give a little more, you hold the door for the next person. Circulation, not exclusion.',
            href: '',
          },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Statement 2 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'hiw-statement-2',
        text: 'The practices, the places, and the people are the point.',
        accent: 'the people',
        tone: 'surface',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Where it starts — heading ────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'hiw-location-heading',
        eyebrow: 'Where it starts',
        title: 'It begins in one real place.',
        titleAccent: '',
        kicker: 'The founding community is taking shape in North County San Diego.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Where it starts — body ───────────────────────────────────────────────
    {
      type: 'Text',
      props: {
        id: 'hiw-location-body',
        body: "Every cell starts somewhere. Ours is taking root in North County San Diego: real Circles, real gatherings, real neighbors who show up for each other. Join the beta and you're not a number on a waitlist; you're one of the people this whole thing grows from.",
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── CTA ──────────────────────────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'hiw-cta',
        eyebrow: '',
        heading: 'Find your people.',
        headingAccent: '',
        body: 'Pick what you practice, find a Circle near you, and start showing up.',
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
