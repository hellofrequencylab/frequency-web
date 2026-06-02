import type { Data } from '@measured/puck'

export const data: Data = {
  root: {},
  content: [
    // ── Hero ─────────────────────────────────────────────────────────────────
    {
      type: 'Hero',
      props: {
        id: 'the-lab-hero',
        variant: 'image',
        eyebrow: 'The Lab',
        title: 'A third space with a front door.',
        titleAccent: '',
        subtitle:
          'Not home, not work. A real place you can walk into — dark wood, warm light, steam and greenery — engineered to bring your whole system back to baseline. The first one is taking root in North County San Diego.',
        image: '/images/site/lab-thermal.jpg',
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

    // ── The premise — heading ────────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'the-lab-premise-heading',
        eyebrow: 'The premise',
        title: 'Community needs a body.',
        titleAccent: '',
        kicker: 'The app is the thread. This is where it lands.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The premise — body copy ──────────────────────────────────────────────
    {
      type: 'Text',
      props: {
        id: 'the-lab-premise-body',
        body: "A feed can keep people warm between meetings. It can't hold a sound bath, a cold plunge, or the hour after when nobody wants to leave. The Lab is the room those things happen in — a place built to be felt, not scrolled.\n\nLight, sound, temperature, and the people around you are all tuned to do one thing: bring you back to yourself, then back to each other.",
        size: 'lg',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Statement ────────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'the-lab-statement-1',
        text: 'Not a gym. Not a café. Not a studio. All of it, on purpose.',
        accent: 'All of it',
        tone: 'surface',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Movement studios ─────────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'the-lab-movement-studios',
        image: '/images/site/lab-concept.jpg',
        alt: 'A warm, plant-filled movement studio inside The Lab, lit for an evening class',
        eyebrow: 'Movement studios',
        title: 'Rooms built to move you.',
        titleAccent: '',
        kicker: '',
        body: "Step in off the street and the noise drops away. Breathwork at sunrise, strength through the day, ecstatic dance once the lights go low. Studios designed around your nervous system — wood underfoot, plants in the corners, sound that wraps the room.\n\nThe schedule is shaped by the community, not a franchise playbook. The practices people show up for are the ones that stay on the board.",
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

    // ── The thermal circuit ──────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'the-lab-thermal-circuit',
        image: '/images/site/lab-thermal.jpg',
        alt: 'The cedar sauna and thermal circuit at The Lab, glowing in amber light',
        eyebrow: 'The thermal circuit',
        title: 'Heat, then cold, then quiet.',
        titleAccent: '',
        kicker: '',
        body: "Sweat it out in the cedar sauna until the mind goes quiet. This is the first half of the loop — the part that opens you up before the cold snaps you back.\n\nTwenty minutes here can reset a whole day. It's the ritual the regulars build their week around.",
        side: 'right',
        imgAspect: 'portrait',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The cold pool ────────────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'the-lab-cold-pool',
        image: '/images/site/lab-pool.jpg',
        alt: 'The cold plunge pool at The Lab, still water under low light',
        eyebrow: 'The cold pool',
        title: 'Shock it all loose.',
        titleAccent: '',
        kicker: '',
        body: "Out of the sauna and straight into the plunge. The contrast is the medicine — it floods you with clarity and leaves you grinning at a stranger across the water.\n\nDo it alone and it's a habit. Do it with your circle and it becomes the thing you text each other about at 6am.",
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

    // ── The connection bar ───────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'the-lab-connection-bar',
        image: '/images/site/lab-lounge.jpg',
        alt: 'The connection bar lounge at The Lab — dark wood, warm light, soft seating',
        eyebrow: 'The connection bar',
        title: 'Where the talking happens.',
        titleAccent: '',
        kicker: '',
        body: "Land at the bar with a coffee and somebody you didn't know an hour ago. No alcohol agenda — adaptogens, tea, real conversation, and the kind of lingering most places are designed to prevent.\n\nThis is the third place between the studio and the door, where strangers quietly become the people you came for.",
        side: 'right',
        imgAspect: 'portrait',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Inside — what you'll find (FeatureGrid) ──────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'the-lab-inside-grid',
        eyebrow: 'Inside',
        title: "What you'll find.",
        titleAccent: '',
        style: 'icon',
        columns: '2',
        items: [
          {
            icon: 'Zap',
            image: '',
            title: 'Movement studios',
            body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between — programmed for your nervous system, not a mirror.',
            href: '',
          },
          {
            icon: 'Flame',
            image: '',
            title: 'The thermal circuit',
            body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
            href: '',
          },
          {
            icon: 'Star',
            image: '',
            title: 'The cold pool',
            body: "A plunge that shocks everything loose. Do it alone and it's a habit; do it with your circle and it's a ritual.",
            href: '',
          },
          {
            icon: 'Coffee',
            image: '',
            title: 'The connection bar',
            body: 'No alcohol agenda — adaptogens, coffee, tea, and the lingering that turns strangers into regulars.',
            href: '',
          },
          {
            icon: 'Sparkles',
            image: '',
            title: 'The events floor',
            body: 'Sound baths, talks, ceremony, celebration. A flexible room built to hold a crowd that already knows each other.',
            href: '',
          },
          {
            icon: 'Users',
            image: '',
            title: 'Where circles meet',
            body: 'The groups you find in the app get a front door here. The feed brings you; the room takes over.',
            href: '',
          },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── The events floor ─────────────────────────────────────────────────────
    {
      type: 'MediaText',
      props: {
        id: 'the-lab-events-floor',
        image: '/images/site/lab-concept.jpg',
        alt: 'The events floor at The Lab set for an evening gathering, strung with warm light',
        eyebrow: 'The events floor',
        title: 'Room to gather.',
        titleAccent: '',
        kicker: '',
        body: "The same events you RSVPd to in the app — sound baths, workshops, sunset socials, the occasional full-blown celebration — happening in a room built to hold a crowd that actually knows each other.\n\nWhen a circle outgrows a living room, this is where it lands. The floor flexes from an intimate ceremony to a packed Saturday night.",
        side: 'left',
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

    // ── Statement 2 ──────────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'the-lab-statement-2',
        text: 'The community comes first. The Lab is where it gets a body.',
        accent: 'The Lab is where it gets a body.',
        tone: 'ink',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Marquee ──────────────────────────────────────────────────────────────
    {
      type: 'Marquee',
      props: {
        id: 'the-lab-marquee',
        items: [
          { text: 'Move' },
          { text: 'Sweat' },
          { text: 'Plunge' },
          { text: 'Linger' },
          { text: 'Gather' },
          { text: 'Belong' },
        ],
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Where it begins — heading ────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'the-lab-location-heading',
        eyebrow: 'Where it begins',
        title: 'Founded in North County San Diego.',
        titleAccent: '',
        kicker: 'The first room, built by the first members.',
        size: 'default',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Where it begins — body ───────────────────────────────────────────────
    {
      type: 'Text',
      props: {
        id: 'the-lab-location-body',
        body: "The first Lab is a prototype — a flagship rooted in one neighborhood, shaped by the people it serves. By the time a place is ready for a Lab, the community is already there: the circles are meeting, the rituals are forming, the regulars know each other's names.\n\nIt's built from day one to be repeatable, so the version that works in North County San Diego can open in your city next. The community always comes first; the Lab is simply where it gets a body.",
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
        id: 'the-lab-cta',
        eyebrow: '',
        heading: 'Be part of building the first one.',
        headingAccent: '',
        body: 'The community is how the Lab begins. Join the Beta and help shape the room before the doors open.',
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
