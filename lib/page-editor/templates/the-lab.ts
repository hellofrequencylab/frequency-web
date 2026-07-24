import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  FOUNDING_PLACE,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE LAB — the VISION template. Built on the EXEMPLAR shape in
// templates/the-community.ts: one shared `L` layout literal, an alternating tone
// beat (surface → canvas → surface …), Statement interstitials between movements,
// exactly one dark (`ink`) beat near the end, then the close.
//
// What this page does: paints the Frequency Lab as the third place the community
// is growing toward, the house it earns together. It is scrupulously HONEST that
// the Lab is NOT open yet (CONTENT-VOICE §7: "the first Lab does not exist yet").
// So the whole page is framed as what we're building, never a door you can walk
// through today. The sensory tour is written as "picture it / the plan / what
// we're building," never present-tense "you sit in the sauna." Then the growth
// path (Circle → Hub → Nexus → Outpost → Lab) shows the Lab is the end of a real
// ladder, and the BackTheBuild close carries the founding ask plus the honest
// "not yet, here's the path."
//
// CTA RULE for The Lab: the primary action is Back the Build, carried by the
// closing BackTheBuild band, framed around JOINING/BUILDING the community that
// brings the Lab, never "come visit." The one quiet secondary is the member path
// (BETA_CTA_SECONDARY_LABEL/HREF), carried in the note under the button. The hero
// leads with the narrative and carries no button; we never stack buttons.
//
// Canon (docs/NAMING.md): the Frequency Lab is the standalone for-profit venue;
// an Outpost is the brick-and-mortar HQ of a Nexus and the seed toward a Lab;
// Circles meet in homes and public spaces, never Outposts. Community structure is
// Circle → Hub → Nexus, with the Outpost as a Nexus's home base. The community
// always comes first; the Lab is where it gets a body. No member counts, no
// leaderboards, no invented numbers. No em dashes. Sentence-case headings.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── image variant, the vision stated plainly as where we are headed,
    // no button (the narrative leads; the founding ask waits for the close). The
    // subtitle is unambiguous: it does not exist yet, we're building the first. ──
    {
      type: 'Hero',
      props: {
        id: 'tl-hero',
        variant: 'image',
        eyebrow: 'The Frequency Lab',
        title: 'The third space the community is building toward.',
        titleAccent: 'building toward',
        subtitle:
          "Not home, not work. A real room to walk into one day: dark wood, warm light, steam and cold water, a cafe, and somewhere to switch off in person. It doesn't exist yet. The community is the thing that builds it, and the first one starts where that community is strongest.",
        image: '/images/site/lab-concept.jpg',
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

    // ── The premise ── say it plainly: a feed has no doors. The Lab is the body
    // the community grows toward, named as a plan, not a place open today. ───────
    {
      type: 'Heading',
      props: {
        id: 'tl-premise-h',
        eyebrow: 'Why a building',
        title: 'The feed has no doors.',
        titleAccent: 'no doors',
        kicker: 'The app is the thread. The Lab is the room we want it to land in.',
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
        body: "A feed can keep people warm between meetings. It can't hold a sound bath, a cold plunge, or the hour after when nobody wants to leave. Those things need a room with a front door, and a feed has no doors.\n\nSo here's the honest version. The Frequency Lab isn't open yet. There's no address to give you. It's the third space the community is building toward, and the first one is being designed now. We're showing you the plan so you can help build it, not booking you a session.",
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
        id: 'tl-stmt-1',
        text: 'Not a gym. Not a cafe. Not a studio. The plan is all of it, under one roof.',
        accent: 'all of it',
        tone: 'surface',
        layout: L,
      },
    },

    // ── What a Lab is ── define the thing plainly before the sensory tour, so the
    // tour reads as the rooms inside a known plan, not a place that exists. ──────
    {
      type: 'MediaText',
      props: {
        id: 'tl-what',
        image: '/images/site/lab-storefront.jpg',
        alt: 'A concept render of the planned Frequency Lab street front at dusk, warm light behind the glass',
        eyebrow: 'What a Lab is',
        title: 'One building, tuned for showing up in person.',
        titleAccent: 'in person',
        kicker: 'Think third space, not gym membership.',
        body: "A Frequency Lab is one standalone building designed around a single idea: give a local community somewhere real to be together. Movement rooms, a thermal circuit, a cold pool, a cafe and storefront, and a lounge built for the lingering most places try to prevent.\n\nIt's the for-profit venue at the top of the structure. When a Lab exists, it becomes the home base for the Outpost nearby. The pictures here are concept renders of that plan, so you can see what we mean by a room you'd actually want to live near.",
        side: 'right',
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

    // ── Sensory tour 1 ── movement studios. Building as instrument: wood, plants,
    // sound that wraps the room. Concrete detail, framed as the plan ("picture",
    // "designed to"), no wellness jargon, no present-tense "you do this here." ───
    {
      type: 'MediaText',
      props: {
        id: 'tl-studios',
        image: '/images/site/lab-concept.jpg',
        alt: 'A concept render of a warm, plant-filled movement studio inside the planned Lab, lit for an evening class',
        eyebrow: 'The plan: movement studios',
        title: 'Rooms designed to move you.',
        titleAccent: 'move you',
        kicker: 'Picture stepping in off the street and the noise dropping away.',
        body: 'Wood underfoot, plants in the corners, and sound that wraps the whole room. Breathwork at sunrise, strength through the day, dance once the lights go low. The floors would be sprung, the light low and warm, the speakers set where you feel the bass in your chest, not your ears.\n\nThe schedule gets shaped by the community, not a franchise playbook. The practices people show up for would be the ones that stay on the board.',
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Sensory tour 2 ── the thermal circuit. Heat then cold then quiet. Cedar,
    // steam, still water. Framed as the loop we want to build. ──────────────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-thermal',
        image: '/images/site/lab-thermal.jpg',
        alt: 'A concept render of the cedar sauna and thermal circuit planned for the Lab, glowing in amber light',
        eyebrow: 'The plan: a thermal circuit',
        title: 'Heat, then cold, then quiet.',
        titleAccent: 'cold',
        kicker: 'Cedar that smells like a forest at the back of your throat.',
        body: "The first half of the loop is the sauna: steam thick enough to soften your shoulders, hot enough that the room goes amber and the mind goes quiet. It's the part that opens you up before the cold snaps you back.\n\nThis is the kind of twenty minutes that can reset a whole day. We want it to be the loop a community builds a week around.",
        side: 'right',
        imgAspect: 'portrait',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
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
        alt: 'A concept render of the cold plunge pool planned for the Lab, still water under low light',
        eyebrow: 'The plan: a cold pool',
        title: 'Shock it all loose.',
        titleAccent: 'loose',
        kicker: 'Straight from the cedar into still, cold water.',
        body: "The contrast is the medicine. One sharp breath in, then the noise in your head goes flat and clean, and you come up grinning at a stranger across the water before you've even said hello.\n\nDo it alone and it's a habit. Do it with your Circle and it becomes the thing you text each other about at six in the morning. That's the version of this room we're after.",
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Sensory tour 4 ── the cafe and connection bar. Where the talking happens.
    // No alcohol agenda, just the lingering that turns strangers into regulars. ──
    {
      type: 'MediaText',
      props: {
        id: 'tl-bar',
        image: '/images/site/lab-lounge.jpg',
        alt: 'A concept render of the cafe and lounge planned for the Lab: dark wood, warm light, soft seating',
        eyebrow: 'The plan: a cafe and lounge',
        title: 'Where the talking happens.',
        titleAccent: 'talking',
        kicker: 'Picture landing at the counter with a coffee and somebody you met an hour ago.',
        body: 'No alcohol agenda. A coffee, a tea, an adaptogen tonic, and the kind of lingering most places are designed to prevent. Low light, soft seats, and a counter long enough that nobody has to stand alone.\n\nThis would be the storefront and the third space between the studio and the door, the room where strangers quietly become the people you came for.',
        side: 'right',
        imgAspect: 'portrait',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── Inside ── quick-scan grid of the rooms under one roof, tuned room by room.
    // Headline names it as the plan, and the cards stay future-framed. ──────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'tl-inside',
        eyebrow: 'Inside the plan',
        title: 'One building, tuned room by room.',
        titleAccent: 'room by room',
        style: 'icon',
        columns: '2',
        items: [
          { icon: 'Flame', image: '', title: 'Movement studios', body: 'Sprung floors, warm light, sound that wraps the room. Built to calm you down, not chase a mirror.', href: '' },
          { icon: 'Sun', image: '', title: 'The thermal circuit', body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.', href: '' },
          { icon: 'Leaf', image: '', title: 'The cold pool', body: "A plunge to shock everything loose. Alone it's a habit, with your Circle it's a ritual.", href: '' },
          { icon: 'Coffee', image: '', title: 'The cafe and lounge', body: 'No alcohol agenda. Adaptogens, coffee, tea, and the lingering that turns strangers into regulars.', href: '' },
          { icon: 'Sparkles', image: '', title: 'The events floor', body: 'Sound baths, talks, ceremony, celebration. A flexible room to hold a crowd that already knows each other.', href: '' },
          { icon: 'Users', image: '', title: 'A front door for Circles', body: 'The groups you find in the app would get a room here. The feed brings you, the building takes over.', href: '' },
        ],
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },
    {
      type: 'Statement',
      props: {
        id: 'tl-stmt-2',
        text: 'The community comes first. The Lab is the house it earns together.',
        accent: 'earns together',
        tone: 'surface',
        layout: L,
      },
    },

    // ── A place beat ── the sunset/atmosphere image, tying the venue to a real
    // landscape and the founding place, still honest about pre-launch. ──────────
    {
      type: 'MediaText',
      props: {
        id: 'tl-place',
        image: '/images/site/sunset.jpg',
        alt: 'A wide, calm sunset over the coast near where the first community is taking root',
        eyebrow: 'Where it starts',
        title: 'The first one starts where the community is strongest.',
        titleAccent: 'strongest',
        kicker: `The community is already taking root in ${FOUNDING_PLACE}.`,
        body: `A Lab doesn't get dropped into a town and hope people come. It's the opposite. By the time a place is ready for one, the Circles are already meeting, the rituals are already forming, and the regulars already know each other by name.\n\nThat's why the first Lab starts in ${FOUNDING_PLACE}: not because the building is ready, but because the community is becoming strong enough to hold one. The room follows the people, never the other way around.`,
        side: 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: '',
        ctaHref: '',
        tone: 'canvas',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── How it grows ── the real ladder, on canon: Circle → Hub → Nexus →
    // Outpost → Lab. This is the spine of the "not yet, here's the path" frame:
    // the Lab is the END of a structure that starts with one Circle. ────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'tl-path',
        eyebrow: 'How it grows',
        title: 'A Lab is the end of a path that starts with one Circle.',
        titleAccent: 'one Circle',
        style: 'number',
        columns: '3',
        items: [
          { icon: 'Users', image: '', title: 'Circles', body: 'A few people, a standing time, a room someone holds open. They meet in homes and public spaces. This is where everything starts.', href: '' },
          { icon: 'Compass', image: '', title: 'Hubs', body: 'Circles nearby cluster into a Hub. Now there are enough people in one area to share a calendar and back each other up.', href: '' },
          { icon: 'MapPin', image: '', title: 'A Nexus', body: 'Hubs grow into a Nexus, a whole local community. This is the scale that can support a place of its own.', href: '' },
          { icon: 'Star', image: '', title: 'An Outpost', body: 'A Nexus plants an Outpost, its brick-and-mortar home base. The seed of a Lab, and proof the room has people to fill it.', href: '' },
          { icon: 'Flame', image: '', title: 'A Frequency Lab', body: 'When a Nexus is strong enough, the Outpost grows into a full Lab, with the building, the heat, the cold, and the cafe.', href: '' },
          { icon: 'Handshake', image: '', title: 'Then the next city', body: 'The first Lab is built to be repeatable, so the version that works can open where your community is strong enough next.', href: '' },
        ],
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The single dark beat ── the honest "not yet" stated head-on, in ink: no
    // address, no opening date, just a real path and an honest invitation. ──────
    {
      type: 'MediaText',
      props: {
        id: 'tl-honest',
        image: '/images/site/lab-storefront.jpg',
        alt: 'A concept render of the first Frequency Lab street front at night, warm light behind the glass, doors not yet open',
        eyebrow: 'The honest part',
        title: "Not yet. Here's the path.",
        titleAccent: 'the path',
        kicker: `Founded in ${FOUNDING_PLACE}, built to travel.`,
        body: `There's no Lab to visit today. No address, no opening night on the calendar. We could fake a countdown, but that's exactly the kind of thing this place exists to be the opposite of.\n\nWhat's real is the path. The first room is being designed now, and it gets built the same way everything here does: a Circle near you, then a Hub, then a Nexus strong enough to hold a Lab. If you want a third space in your town, the honest first step isn't waiting for a door. It's helping open one.`,
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
          { text: 'Start a Circle' },
          { text: 'Grow a Hub' },
          { text: 'Build a Nexus' },
          { text: 'Plant an Outpost' },
          { text: 'Earn the Lab' },
          { text: 'Then the next city' },
        ],
        layout: L,
      },
    },

    // ── Close ── BackTheBuild: the vision and the founding ask on one scroll. The
    // primary CTA (Back the build) is framed around BUILDING the community that
    // brings the Lab, never "visit." The one quiet secondary is the member path,
    // carried in the note under the button. Renders its own dark band. ──────────
    {
      type: 'BackTheBuild',
      props: {
        id: 'tl-back-the-build',
        eyebrow: 'Back the build',
        title: 'Help build the first room.',
        titleAccent: 'first room',
        body: `The Lab is being built by the people who'll use it. No investor playbook, just a community putting the first room together in ${FOUNDING_PLACE}, then handing the blueprint to the next city.\n\nBack the build and you aren't buying a session at a place that doesn't exist yet. You're starting the Circle, growing the community, and putting your name on the wall of the house this all earns.`,
        tiers: [
          { amount: 'Founding', name: 'Member', blurb: 'Your name among the first, and a seat saved for opening night when it comes.' },
          { amount: 'Founding', name: 'Circle', blurb: 'Bring your Circle in together and help shape the room from the start.' },
          { amount: 'Founding', name: 'Patron', blurb: 'Hold the door open for the neighbors who come after you.' },
        ],
        ctaLabel: BETA_CTA_LABEL,
        ctaHref: BETA_CTA_HREF,
        secondaryNote: `Not ready to lead one? You can ${BETA_CTA_SECONDARY_LABEL.replace(/^or /, '')}, and we'll bring you in as the build takes shape.`,
        layout: L,
      },
    },
  ],
}
