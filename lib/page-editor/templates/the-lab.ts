import type { Data } from '@/lib/page-editor/types'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// THE LAB — the 2028 vision page, expressed in blocks (owner directive: the
// template IS the page). Mirrors the coded rebuild in app/(marketing)/the-lab/
// page.tsx (commit 329cc4f, itself built to design_handoff/dawn/ui_kits/
// marketing/lab.html): a dark photographic hero carrying an intention rather
// than an offer, the three intended rooms on the ink band with concept imagery
// labelled "Reference, not our room", the cream plan band with the Now → 2027 →
// 2028 build timeline where rate cards would sit, the statement interstitial,
// the "in the meantime" trio pointing at the community that already exists, the
// triptych nav, and the dark close. Same structure, same copy, plus the FAQ
// the coded body declared but never rendered (LIVE-040, see `tl-faq` below).
//
// HONESTY CONTRACT (CONTENT-VOICE §7, design_handoff/CHANGES.md): nothing on
// this page is bookable and no rates appear anywhere. The hero note says so in
// plain words; the timeline replaces anything rate-card-like; concept
// photography is labelled for what it is. No member counts, no invented
// numbers, no address beyond the founding area the site already names.
//
// CTA RULE: the hero pairs Follow the build (/subscribe) with the quiet
// Find a Circle now (/discover); the closing ink CallToAction carries the
// shared beta CTA. No stacked buttons anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero: the intention, and the honest disclaimer under the CTAs. ─────────
    {
      type: 'Hero',
      props: {
        id: 'tl-hero',
        variant: 'image',
        eyebrow: 'The Lab · A vision for 2028',
        title: 'Heat then cold with other people',
        titleAccent: 'with other people',
        subtitle:
          "Calm isn't something you can download. The body of this community is a room with a sauna, a cold plunge, and somebody counting you down. We haven't built it yet.",
        image: '/images/site/lab-thermal.jpg',
        focal: 'center',
        minHeight: 'auto',
        facts: [],
        ctaPrimaryLabel: 'Follow the build',
        ctaPrimaryHref: '/subscribe',
        ctaSecondaryLabel: 'Find a Circle now',
        ctaSecondaryHref: '/discover',
        note: 'Nothing here is bookable. The first Lab is planned to open in 2028. Until then the community meets in rooms we borrow, and this page is the plan, not the place.',
        tone: 'surface',
        width: 'default',
        align: 'center',
        layout: L,
      },
    },

    // ── The rooms: raised dark panels on the ink band, still in the dark. ──────
    {
      type: 'PhotoCardRow',
      props: {
        id: 'tl-rooms',
        eyebrow: 'Three rooms, intended',
        title: 'What we mean to build.',
        titleAccent: '',
        kicker: "A specification we're working to, not a facility you can visit.",
        tag: 'Reference, not our room',
        items: [
          {
            image: '/images/site/lab-thermal.jpg',
            alt: 'Reference photograph: low amber light across a cedar sauna',
            label: '01',
            title: 'The thermal circuit',
            body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
          },
          {
            image: '/images/site/lab-pool.jpg',
            alt: 'Reference photograph: a cold plunge pool, still water under low light',
            label: '02',
            title: 'The cold pool',
            body: 'A plunge that shocks everything loose. Do it alone and it’s a habit; do it with your Circle and it’s a ritual.',
          },
          {
            image: '/images/site/lab-concept.jpg',
            alt: 'Reference photograph: a warm, plant-filled movement studio lit for an evening class',
            label: '03',
            title: 'Movement studios',
            body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between. Programmed to help you calm down, not to chase a mirror.',
          },
        ],
        tone: 'ink',
        layout: L,
      },
    },

    // ── The plan band: where a venue page would put rate cards, this page puts
    // the dated build. dot-grid is the schematic texture on cream. ──────────────
    {
      type: 'BuildTimeline',
      props: {
        id: 'tl-build',
        eyebrow: 'Where this actually is',
        title: 'Community first, building second.',
        titleAccent: '',
        kicker: "Most third places sign a lease, then go looking for the people. We're doing it the other way round.",
        intro:
          "A feed can keep people warm between meetings. It can't hold a sound bath, a cold plunge, or the hour after when nobody wants to leave. The Lab is the room those things happen in: a place built to be felt, not scrolled.",
        items: [
          {
            label: 'Now',
            title: 'Circles, in borrowed rooms',
            body: 'Circles are meeting weekly in parks, living rooms, and rented studios. The community is real; the building is not.',
            highlight: 'normal',
          },
          {
            label: '2027',
            title: 'Site and permits',
            body: `A shortlist in ${FOUNDING_PLACE}, then the slow unglamorous part: a site, zoning, and the plumbing a sauna and a cold pool need.`,
            highlight: 'normal',
          },
          {
            label: '2028',
            title: 'The first Lab opens',
            body: 'One building, built from day one to be repeatable. If the first room works, the second is a template instead of an experiment.',
            highlight: 'chosen',
          },
        ],
        footnote:
          "There are no membership rates on this page because there's nothing to sell yet. When there is, the price will be published here before anybody is asked for a card.",
        texture: 'dots',
        flow: 'beat',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── The interstitial. ──────────────────────────────────────────────────────
    {
      type: 'Statement',
      props: {
        id: 'tl-stmt',
        text: 'The community comes first. The Lab is where it gets a body.',
        accent: 'The Lab is where it gets a body.',
        tone: 'canvas',
        layout: L,
      },
    },

    // ── In the meantime: the thing that already exists, on the shoulder. ───────
    {
      type: 'PhotoTrio',
      props: {
        id: 'tl-meantime',
        eyebrow: 'In the meantime',
        title: 'The community is here.',
        titleAccent: '',
        kicker: 'The building is the sequel.',
        intro:
          "Everything the Lab is meant to hold is already happening in borrowed rooms. You don't have to wait for 2028 to be part of it.",
        items: [
          {
            image: '/images/site/breathwork-circle.jpg',
            alt: 'A Circle sitting together for breathwork outdoors',
            title: 'Circles, weekly',
            caption: 'Small standing groups meeting on a fixed day, mostly outdoors, mostly free.',
          },
          {
            image: '/images/site/yoga-in-the-grass.jpg',
            alt: 'People practicing yoga on a public lawn in the morning',
            title: 'Practice, anywhere',
            caption:
              "The breathwork and movement the Lab's floor is being designed for, on a public lawn at sunrise.",
          },
          {
            image: '/images/site/adult-playground-parachute.jpg',
            alt: 'Adults holding the edges of a parachute together on a sunny lawn',
            title: 'The ridiculous parts',
            caption: 'A parachute on the grass. No facility required, which is rather the point.',
          },
        ],
        footnote:
          'The room follows the people, never the other way around. See [what a third space is](/loneliness), or meet the live community on [Discover](/discover).',
        shape: 'arc',
        texture: 'none',
        tone: 'surface',
        layout: L,
      },
    },

    // ── The short answers ── RECOVERED from the retired coded body (LIVE-040).
    // The five questions are verbatim from `THE_LAB_FAQ`, which lived in
    // app/(marketing)/the-lab/page.tsx until commit c3228d76c. Its `faqSchema()`
    // call sat on the LEGACY branch of `data ? <BlockRender/> : <Legacy/>`, and
    // that branch could never be taken, so /the-lab emitted no FAQPage from the
    // day the template landed. This block is the honest fix: `AccordionBlock`
    // builds its FAQPage from the very items it draws, so the structured data
    // cannot out-claim the page (CONTENT-VOICE §8b) and cannot drift from the
    // copy. Do NOT replace it with a hand-written JSON-LD node.
    // ──────────────────────────────────────────────────────────────────────────
    {
      type: 'Accordion',
      props: {
        id: 'tl-faq',
        eyebrow: 'Questions',
        title: 'The short answers.',
        titleAccent: '',
        items: [
          {
            q: 'What is The Lab?',
            a: `The Lab is a third space the Frequency community is building: not home, not work, a real room to move, warm up in the sauna, cool down in the plunge, and switch off in person. The first one is planned for 2028 in ${FOUNDING_PLACE}. It is not open yet.`,
          },
          {
            q: 'Can I visit The Lab yet?',
            a: 'Not yet, and nothing at The Lab is bookable. The first Lab is planned to open in 2028. Until then the community meets in rooms we borrow: parks, living rooms, and rented studios. You can join a Circle near you today.',
          },
          {
            q: 'What will be inside The Lab?',
            a: 'Movement studios, a cedar thermal circuit, a cold plunge pool, a no-alcohol connection bar, and a flexible events floor. One building, tuned room by room.',
          },
          {
            q: 'When will The Lab open?',
            a: 'The plan on the page is dated: Circles meeting in borrowed rooms now, a site and permits through 2027, and the first Lab opening in 2028. There are no membership rates published because there is nothing to sell yet.',
          },
          {
            q: 'Where will the first Lab be?',
            a: `The first Lab is planned for ${FOUNDING_PLACE}, where the founding community is already meeting, and it is built to repeat in other cities once the community is there.`,
          },
        ],
        emphasis: { scale: 'default', accent: 'none' },
        tone: 'surface',
        width: 'default',
        align: 'left',
        layout: L,
      },
    },

    // ── The triptych cross-link. ───────────────────────────────────────────────
    {
      type: 'PillarNav',
      props: {
        id: 'tl-pillars',
        current: '/the-lab',
        tone: 'surface',
        layout: L,
      },
    },

    // ── Close — the dark beat. ─────────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'tl-cta',
        eyebrow: '',
        heading: 'Be part of building the first one.',
        headingAccent: '',
        body: 'The community is how the Lab begins. Join the Beta and help shape the room before the doors open.',
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
