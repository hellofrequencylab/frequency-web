import type { Data } from '@measured/puck'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE LAB — the vision template. Built on the EXEMPLAR shape in
// templates/the-community.ts: one shared `L` layout literal, an alternating tone
// beat, Statement interstitials between movements, exactly one dark (`ink`) beat
// near the end, then the close.
//
// What this page does: paints the third space the communities are growing toward,
// framed clearly as where we are HEADED, not a place open today. Building as an
// instrument, told in concrete sensory detail (light, sound, materials, heat,
// cold, water), no wellness jargon. Then the BackTheBuild band carries the vision
// plus the founding ask on one scroll, with a light "bring it to your city" thread.
//
// CTA RULE for The Lab (the one page allowed a second primary action): the page's
// primary CTA is Back the Build, carried by the closing BackTheBuild band; the one
// quiet secondary is Join the Beta (BETA_CTA_LABEL/BETA_CTA_HREF). The hero leads
// with the narrative and carries no button; we never stack buttons.
//
// Canon: the Frequency Lab is the standalone third space; the Circle is the unit;
// the community always comes first, the Lab is where it gets a body. No member
// counts, no leaderboards, no invented numbers. No em dashes. Sentence-case
// headings.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the dream stated plainly as where we are headed,
    // no button (the narrative leads; the founding ask waits for the close). ─────
    {
      type: 'Hero',
      props: {
        id: 'tl-hero',
        variant: 'image',
        eyebrow: 'The Lab',
        title: 'A third space with a front door.',
        titleAccent: 'front door',
        subtitle:
          'Not home, not work. A real room you can walk into: dark wood, warm light, steam and cold water, somewhere to switch off in person. We are building the first one now.',
        image: '/images/site/lab-thermal.jpg',
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

    // ── The premise ── say it plainly: a feed cannot hold a room. The Lab is the
    // body the community grows toward, named as a plan, not a place open today. ──
    {
      type: 'Heading',
      props: {
        id: 'tl-premise-h',
        eyebrow: 'The premise',
        title: 'A community needs a body.',
        titleAccent: 'body',
        kicker: 'The app is the thread. The Lab is where it lands.',
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
        id: 'tl-premise-b',
        body: "A feed can keep people warm between meetings. It can't hold a sound bath, a cold plunge, or the hour after when nobody wants to leave. The Lab is the room those things happen in: a place built to be felt, not scrolled.\n\nWe are honest about where this stands. The Lab is not open yet. It is the place the community is growing toward, and the first one is being designed and built right now. Light, sound, temperature, and the people in the room are all tuned to do one thing: bring you back to yourself, then back to each other.",
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
        id: 'tl-stmt-1',
        text: 'Not a gym. Not a cafe. Not a studio. All of it, on purpose.',
        accent: 'All of it',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Sensory tour 1 ── movement studios. Building as instrument: wood, plants,
    // sound that wraps the room. Concrete detail, no wellness jargon. ────────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-studios',
        image: '/images/site/lab-concept.jpg',
        alt: 'A warm, plant-filled movement studio inside The Lab, lit for an evening class',
        eyebrow: 'Movement studios',
        title: 'Rooms built to move you.',
        titleAccent: 'move you',
        kicker: 'Step in off the street and the noise drops away.',
        body: 'Wood underfoot, plants in the corners, and sound that wraps the whole room. Breathwork at sunrise, strength through the day, dance once the lights go low. The floor is sprung, the light is low and warm, and the speakers sit where you feel the bass in your chest, not your ears.\n\nThe schedule is shaped by the community, not a franchise playbook. The practices people show up for are the ones that stay on the board.',
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

    // ── Sensory tour 2 ── the thermal circuit. Heat then cold then quiet. Cedar,
    // steam, still water. The loop the regulars build a week around. ────────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-thermal',
        image: '/images/site/lab-thermal.jpg',
        alt: 'The cedar sauna and thermal circuit at The Lab, glowing in amber light',
        eyebrow: 'The thermal circuit',
        title: 'Heat, then cold, then quiet.',
        titleAccent: 'cold',
        kicker: 'Cedar that smells like a forest at the back of your throat.',
        body: 'Sit in the sauna until the room goes amber and the mind goes quiet. Steam thick enough to soften your shoulders. This is the first half of the loop, the part that opens you up before the cold snaps you back.\n\nTwenty minutes in here can reset a whole day. It is the ritual the regulars build their week around.',
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

    // ── Sensory tour 3 ── the cold pool. The plunge, the gasp, the grin across the
    // water. Alone it is a habit; with your Circle it is a ritual. ──────────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-pool',
        image: '/images/site/lab-pool.jpg',
        alt: 'The cold plunge pool at The Lab, still water under low light',
        eyebrow: 'The cold pool',
        title: 'Shock it all loose.',
        titleAccent: 'loose',
        kicker: 'Straight from the cedar into still, cold water.',
        body: 'The contrast is the medicine. One sharp breath in, then the noise in your head goes flat and clean. You come up grinning at a stranger across the water before you have even said hello.\n\nDo it alone and it is a habit. Do it with your Circle and it becomes the thing you text each other about at six in the morning.',
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

    // ── Sensory tour 4 ── the connection bar. Where the talking happens. No
    // alcohol agenda, just lingering that turns strangers into regulars. ────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-bar',
        image: '/images/site/lab-lounge.jpg',
        alt: 'The connection bar lounge at The Lab: dark wood, warm light, soft seating',
        eyebrow: 'The connection bar',
        title: 'Where the talking happens.',
        titleAccent: 'talking',
        kicker: 'Land at the bar with a coffee and somebody you met an hour ago.',
        body: 'No alcohol agenda. A coffee, a tea, an adaptogen tonic, and the kind of lingering most places are designed to prevent. Low light, soft seats, and a counter long enough that nobody has to stand alone.\n\nThis is the third place between the studio and the door, where strangers quietly become the people you came for.',
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

    // ── Inside ── quick-scan grid of the rooms under one roof, tuned room by room.
    {
      type: 'FeatureGrid',
      props: {
        id: 'tl-inside',
        eyebrow: 'Inside',
        title: 'One building, tuned room by room.',
        titleAccent: 'room by room',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'Flame', image: '', title: 'Movement studios', body: 'Sprung floors, warm light, sound that wraps the room. Programmed to calm you down, not chase a mirror.', href: '' },
          { icon: 'Sun', image: '', title: 'The thermal circuit', body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.', href: '' },
          { icon: 'Leaf', image: '', title: 'The cold pool', body: 'A plunge that shocks everything loose. Alone it is a habit, with your Circle it is a ritual.', href: '' },
          { icon: 'Coffee', image: '', title: 'The connection bar', body: 'No alcohol agenda. Adaptogens, coffee, tea, and the lingering that turns strangers into regulars.', href: '' },
          { icon: 'Sparkles', image: '', title: 'The events floor', body: 'Sound baths, talks, ceremony, celebration. A flexible room built to hold a crowd that already knows each other.', href: '' },
          { icon: 'Users', image: '', title: 'Where Circles meet', body: 'The groups you find in the app get a front door here. The feed brings you, the room takes over.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Statement',
      props: {
        id: 'tl-stmt-2',
        text: 'The community comes first. The Lab is where it gets a body.',
        accent: 'gets a body',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── The single dark beat ── where it begins. The first room, in one
    // neighborhood, built to be repeatable so it can open in your city next. ────
    {
      type: 'MediaText',
      props: {
        id: 'tl-begins',
        image: '/images/site/lab-storefront.jpg',
        alt: 'The street front of the first Frequency Lab at dusk, warm light behind the glass',
        eyebrow: 'Where it begins',
        title: 'The first room, then the next city.',
        titleAccent: 'next city',
        kicker: `Founded in ${FOUNDING_PLACE}, built to travel.`,
        body: `The first Lab is a prototype: one room, in one neighborhood, shaped by the people it serves. By the time a place is ready for a Lab, the community is already there. The Circles are meeting, the rituals are forming, the regulars know each other by name.\n\nIt is built from day one to be repeatable, so the version that works in ${FOUNDING_PLACE} can open in your city next. If you want to bring one home, that thread starts the same way everything here does: with a Circle near you.`,
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
        id: 'tl-marquee',
        items: [
          { text: 'Move' },
          { text: 'Sweat' },
          { text: 'Plunge' },
          { text: 'Linger' },
          { text: 'Gather' },
          { text: 'Belong' },
        ],
        layout: L,
      },
    },

    // ── Close ── BackTheBuild: the vision and the founding ask on one scroll. The
    // page's primary CTA is Back the Build; the one quiet secondary is Join the
    // Beta, carried in the note under the button. Renders its own dark band. ─────
    {
      type: 'BackTheBuild',
      props: {
        id: 'tl-back-the-build',
        eyebrow: 'Back the build',
        title: 'Help build the first room.',
        titleAccent: 'first room',
        body: `The Lab is being built by the people who will use it. No investor playbook, just a community putting the first room together in ${FOUNDING_PLACE}, then handing the blueprint to the next city.\n\nBack the build and you are not buying a membership. You are putting your name on the wall of the place this all begins.`,
        tiers: [
          { amount: 'Founding', name: 'Member', blurb: 'Your name among the first, and a seat saved for opening night.' },
          { amount: 'Founding', name: 'Circle', blurb: 'Bring your Circle in together and help shape the room.' },
          { amount: 'Founding', name: 'Patron', blurb: 'Hold the door open for the neighbors who come after you.' },
        ],
        ctaLabel: 'Back the build',
        ctaHref: BETA_CTA_HREF,
        secondaryNote: `Not ready to back it yet? ${BETA_CTA_LABEL} and we will bring you in as the build takes shape.`,
        layout: L,
      },
    },
  ],
}
