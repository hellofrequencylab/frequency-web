// Seed FREQUENCY HQ: the house account's own Space, the platform's program and info hub, help desk, community forum and
// host-training hub (owner asks, 2026-11-17: "a hub for hosts and people learning how to be hosts", then "an internal
// program and info hub, help desk and community forum"). Owned by the house account @frequency (profiles 78d47bae, the
// same owner The Group's Spaces are seeded under), with @danieltyack seated as a Space admin beside it. The same run
// fills out @frequency itself as the primary business profile: bio, website, contact card and a styled Spotlight.
//
//   pnpm seed:frequency-hosts --sql > scripts/seed-frequency-hosts.sql
//   (add --replace-pages to rewrite pages and pageDocs too; only before the owner has edited them)
//
// prints ONE SQL transaction. Every statement is an upsert on a natural key (slug / deterministic id), so
// a re-run updates in place and never duplicates. Page edits survive a re-run: pageDocs, pages, profileLayout, websiteEditor and
// websitePublished are only written while the Space has none (the seed-the-group rule, SCAN-1016). The Space row is only touched while
// @frequency still owns it.
//
// Shapes are copied from the product's own writers, not invented:
//   - the Space row: lib/spaces/provision.ts createSpace + scripts/seed-the-group.sql (a house-owned Space)
//   - the theme: lib/theme/apply-mega-theme.ts planMegaTheme({}, 'new-world') -> theme / siteStyle / megaTheme
//   - the accent: lib/theme/new-world.ts NEW_WORLD_ACCENTS.tide (the New World hosts kit's own accent)
//   - the page blocks: components/page-editor/blocks/new-world.tsx, the props lib/sites/kits/new-world-variants.ts writes
//   - the journeys: scripts/seed-wildheart.mts (journey_plans + the phase / module / lesson tree)
//
// DESIGN SYSTEM. New World is the Frequency Design System's Space theme ("New World - Frequency Design System").
// Photos are the design system's own (public/brand/frequency/photos, real gatherings only) and the New World
// theme set (public/sites/new-world/photos). The logo is the Frequency round icon. Nothing is drawn or invented.
//
// VOICE. docs/CONTENT-VOICE.md: sentence case, contractions, no em dashes, no hype words, "Journey" only as the
// product object. Research the training draws on is paraphrased and credited on the About page: the Way of Council
// (Zimmerman and Coyle), the Courage & Renewal Touchstones (Parker Palmer), Priya Parker's "generous authority",
// and SAMHSA's six principles of a trauma-informed approach.

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { BOC_101 } from './seed-frequency-hq-boc.mts'
import { buildBocSalesDoc, BOC_SALES_META } from './seed-frequency-hq-boc-sales.mts'

// ── Fixed ids ──────────────────────────────────────────────────────────────────────────────────
export const OWNER_ID = '78d47bae-c4c8-4d1c-80a0-ac69aaf98ef8' // @frequency, the house account
export const ADMIN_ID = 'c1d40f58-318b-4c7b-a331-21788d632fc9' // @danieltyack
export const SLUG = 'hq'
const TZ = 'America/Los_Angeles'
const SITE = 'https://frequencylocal.com' // lib/site.ts SITE_URL (Spotlight links must be absolute https)
const EMAIL = 'hello@frequencylocal.com' // lib/site.ts CONTACT_EMAIL
const SOCIAL = [
  { label: 'Instagram', url: 'https://www.instagram.com/frequencylocal' },
  { label: 'TikTok', url: 'https://www.tiktok.com/@frequencylocal' },
  { label: 'YouTube', url: 'https://www.youtube.com/@frequencylocal' },
] // lib/site.ts SAME_AS

/** A deterministic uuid from a key, so a re-run hits the same rows. */
function uuidFrom(key: string): string {
  const h = createHash('md5').update(`frequency-hosts:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export const SPACE_ID = uuidFrom('space')

// ── The Space ──────────────────────────────────────────────────────────────────────────────────
export const NAME = 'Frequency'
export const TAGLINE = 'Gather like it matters.'
export const ABOUT =
  "This is the Frequency team's own Space: the home base for everyone building Frequency. Find our programs, take free host training on the PULSE rhythm, learn to run your community in Creator Lab, get help from a real person, and ask the community in the forum."

const ACCENT = '#1AA7C0' // NEW_WORLD_ACCENTS.tide.accent, the hosts kit's accent (aqua: presence)
const LOGO = '/brand/frequency/logo/frequency-icon-round.png'

/** The design system's photos (public/brand/frequency/photos) and the New World set (public/sites/new-world/photos). */
export const PHOTOS = {
  circle: '/brand/frequency/photos/day-meditation-circle.jpg',
  rugs: '/brand/frequency/photos/gathering-03.jpg',
  armsOut: '/brand/frequency/photos/gathering-04.jpg',
  huddle: '/brand/frequency/photos/gathering-12.jpg',
  beachCircle: '/brand/frequency/photos/gathering-14.jpg',
  parachute: '/brand/frequency/photos/day-parachute-play.jpg',
  sunset: '/brand/frequency/photos/gathering-13.jpg',
  daniel: '/brand/frequency/photos/daniel-tyack.jpg',
  sunrise: '/sites/new-world/photos/circle-sunrise.webp',
  fire: '/sites/new-world/photos/fire-circle.webp',
  garden: '/sites/new-world/photos/garden-picnic.webp',
  cafe: '/sites/new-world/photos/cafe-table.webp',
}
const ALT = {
  circle: 'A large circle of people seated on the grass by the ocean, eyes closed',
  rugs: 'People gathered on rugs and cushions in a leafy garden',
  armsOut: 'A circle seated on a lawn with arms stretched wide',
  huddle: 'A tight group hugging and laughing on a seaside deck',
  beachCircle: 'A circle on mats around a gong at the water',
  parachute: 'People holding a rainbow parachute on a clifftop lawn',
  sunset: 'A group moving together on the beach at golden hour',
  daniel: 'Daniel Tyack smiling',
  sunrise: 'A wide circle of people seated on a plaza at sunrise',
  fire: 'People sitting quietly around a fire pit in the evening',
  garden: 'People gathered on rugs and cushions in a leafy backyard garden',
  cafe: 'Three people talking at a small table in a cafe',
}

const PAGE = (slug = '') => (slug ? `/spaces/${SLUG}/${slug}` : `/spaces/${SLUG}`)
const JOURNEY = (slug: string) => `/journeys/${slug}`

// Six pages, MAX_PROFILE_PAGES. None shadows a reserved slug or a static Space route (circles, journeys,
// calendar, practices, people, community, contact, memberships, book, events, ...).
// The forum is the Space's own Community wall (/spaces/hq/community, ADR-1938), a reserved route the nav already carries.
export const PAGES = [
  { slug: 'home', label: 'Home', system: true },
  { slug: 'programs', label: 'Programs' },
  { slug: 'creator-lab', label: 'Creator Lab' },
  { slug: BOC_SALES_META.slug, label: 'Business of Community' },
  { slug: 'help', label: 'Help desk' },
  { slug: 'about', label: 'About' },
]
const FORUM = PAGE('community')
const TICKET = '/support'

// Creator Lab (owner rulings 2026-11-17/18): The Business of Community 101 is free and evergreen for every Space;
// Business Hours and the live cohort come with a paid Space. Course content: scripts/seed-frequency-hq-boc.mts.
export const BOC_SLUG = 'the-business-of-community-101'
export const START_CIRCLE_SLUG = 'creator-lab-december-start'
const CIRCLE = (slug: string) => `/circles/${slug}`
/** The four sessions' one ideas, from the owner's session spec (business-of-community-101.md). */
const BOC_PAGE_SESSIONS = [
  { n: 1, name: 'The Engine', idea: "Structure isn't the opposite of soul. It's what keeps the soul from burning out." },
  { n: 2, name: 'The Container', idea: "A container isn't what you believe. It's what you've written down, said out loud, and will enforce." },
  { n: 3, name: 'The Gathering', idea: "Whatever authority you don't hold, the loudest guest will." },
  { n: 4, name: 'The Exchange', idea: 'Charging is what makes your presence renewable.' },
]

// The four Pillars (docs/NAMING.md: Mind / Body / Spirit / Expression; never Channels or Domains).
export const PILLARS = [
  { icon: 'sparkle', title: 'Mind', body: 'Calm down fast, focus, and think clearly. Practices like breathing, journaling and less scrolling.' },
  { icon: 'heart', title: 'Body', body: 'Move, rest, eat and sleep like you mean it. Walks, stretching, cold water, early nights.' },
  { icon: 'users', title: 'Spirit', body: 'Meaning, gratitude and time with people. Stillness, service and showing up for each other.' },
  { icon: 'award', title: 'Expression', body: 'Make something and share it. The weekly Expression Challenge, alone or with your Circle.' },
]

// Frequency Programs: the structured ways to take part. The Quest is one program among many, not the umbrella.
export const PROGRAMS = [
  { icon: 'award', name: 'The Quest', body: 'Daily practices and Journeys you take with your Circle, across the four Pillars. Show up, earn Zaps and Gems, and climb the season.', who: 'Every member', rhythm: 'Daily', href: '/help/the-quest', image: PHOTOS.sunset, alt: ALT.sunset, button: 'How The Quest works' },
  { icon: 'users', name: 'Circles', body: 'Small groups of 12 to 18 people who meet at the same time in the same place, on the PULSE rhythm.', who: 'Every member', rhythm: 'Weekly or every other week', href: '/circles', image: PHOTOS.armsOut, alt: ALT.armsOut, button: 'Find a Circle' },
  { icon: 'calendar', name: "What's happening", body: 'Local events from Circles and Spaces near you. RSVP, add it to your calendar, bring someone.', who: 'Everyone', rhythm: 'Any week', href: '/events', image: PHOTOS.parachute, alt: ALT.parachute, button: "See what's happening" },
  { icon: 'sparkle', name: 'Creator Lab', body: 'Business and leadership for community creators. The Business of Community 101 is free for every Space; paid Spaces add Business Hours on Zoom.', who: 'Every Space', rhythm: 'One week at a time', href: PAGE('creator-lab'), image: PHOTOS.rugs, alt: ALT.rugs, button: 'Open Creator Lab' },
  { icon: 'heart', name: 'Host training', body: 'Free courses on the PULSE rhythm, care and consent, and the three circle formats, then a co-host apprenticeship.', who: 'Hosts and future hosts', rhythm: 'Self-paced', href: PAGE('creator-lab'), image: PHOTOS.circle, alt: ALT.circle, button: 'Start host training' },
]

export const HELP_CATEGORIES = [
  { kind: 'Start here', title: 'Getting started: what Frequency is and how to find your people', href: '/help/getting-started' },
  { kind: 'Groups', title: 'Circles and events: how gatherings work', href: '/help/groups' },
  { kind: 'Hosting', title: 'Leading a Circle: start one, run the first night, keep it going', href: '/help/leading' },
  { kind: 'Spaces', title: 'Running a Space: the tools a Space gives you', href: '/help/spaces' },
  { kind: 'The Quest', title: 'Zaps, Gems, ranks and rewards', href: '/help/the-quest' },
  { kind: 'Membership', title: "What's free and what Crew adds", href: '/help/membership' },
  { kind: 'Safety', title: 'Reporting, blocking and how moderation works', href: '/help/safety' },
]

// ── The craft, in one place (every page and journey reads these) ──────────────────────────────
export const PULSE = [
  { letter: 'P', title: 'Presence', minutes: '10 min', body: 'Arrive. A few slow breaths, feet on the floor, phones away. The host sets the tone by going first.', host: 'Start on time. Welcome people by name. Name the purpose of tonight in one sentence.' },
  { letter: 'U', title: 'Unite', minutes: '20 min', body: "A check-in round. Each person says how they're arriving, and everyone else listens without replying.", host: 'Read the agreements. Ask one question everyone can answer. Keep it lean so everyone gets a turn.' },
  { letter: 'L', title: 'Lead', minutes: '35 min', body: "Tonight's practice: a teaching, a movement, a conversation or a skill. The part that changes from week to week.", host: 'Give clear steps, an invitation and an opt-out. Watch the room more than your notes.' },
  { letter: 'S', title: 'Settle', minutes: '15 min', body: 'Quiet integration. Rest, journal or sit with what came up before anyone has to talk about it.', host: 'Lower the pace. Offer a simple prompt. Let silence do some of the work.' },
  { letter: 'E', title: 'Exhale', minutes: '10 min', body: 'Close together. One word or one line each, a thank you, and a clear end.', host: 'End on time. Say what happens next and how people can reach you.' },
]

export const FORMATS = [
  {
    key: 'open', name: 'Open Circle', size: '12 to 18 people', length: '60 to 90 min', image: PHOTOS.circle, alt: ALT.circle,
    blurb: "The host keeps the room, with no teaching agenda. People come to be heard and to hear each other.",
    host: 'You open and close, keep the agreements and the time, and pass the turn. You speak least.',
    good: 'A first circle in a new town. A standing weekly night. Anyone can walk in.',
  },
  {
    key: 'community', name: 'Community Circle', size: '12 to 18 people', length: '90 min', image: PHOTOS.rugs, alt: ALT.rugs,
    blurb: "A hosted circle around one shared theme: moon circles, men's and women's circles, grief, new parents, sharing circles.",
    host: 'You choose the theme and the question for the round, and keep the circle on it.',
    good: 'People who share a season of life. A recurring date that builds the same faces over time.',
  },
  {
    key: 'focus', name: 'Focus Circle', size: 'Up to 50 people', length: '90 to 120 min', image: PHOTOS.beachCircle, alt: ALT.beachCircle,
    blurb: 'The host teaches a modality: breathwork, sound, movement, a skill. The PULSE rhythm wraps the teaching so the room still feels like a circle.',
    host: 'You teach in the Lead beat, and the four beats around it keep it personal and safe.',
    good: "Practitioners sharing their work. A doorway into a Space's longer programs.",
  },
]

export const AGREEMENTS = [
  { icon: 'check', title: 'Every practice is an invitation', body: 'Join in, go gently, watch, or pass. No one needs a reason.' },
  { icon: 'heart', title: 'What is shared stays here', body: 'Take the lessons home. Leave the stories and the names in the room.' },
  { icon: 'users', title: 'Speak for yourself', body: "Use I. Speak from your own life, not about anyone else's." },
  { icon: 'message', title: 'No fixing', body: 'Listen without advising, correcting or rescuing. Ask an honest question, or simply say thank you.' },
  { icon: 'calendar', title: 'Start and end on time', body: 'A clear start and a clear end are a kindness. People can plan around you.' },
  { icon: 'award', title: 'Ask before touch', body: 'No touch without a clear yes, every time. Nothing sexual happens in a circle.' },
]

// SAMHSA's six principles of a trauma-informed approach, paraphrased into what a host actually does.
export const PRINCIPLES = [
  { title: 'Safety', body: 'People know where they are, what will happen and how to leave. Physical and emotional safety come before the plan.' },
  { title: 'Trust and transparency', body: 'Say what is coming before it comes. No surprises, no hidden agendas, no trick exercises.' },
  { title: 'Peer support', body: "A circle isn't therapy. People support each other as equals, with the host as a guide, not a fixer." },
  { title: 'Collaboration', body: 'Make agreements with the group, not at them. Share power where you can.' },
  { title: 'Choice and voice', body: 'Every practice has an opt-out. Silence is a valid answer. Passing is always allowed.' },
  { title: 'Culture and context', body: 'People arrive with different histories. Notice who is missing, who is quiet and who is carrying more.' },
]

export const PATH = [
  { icon: 'calendar', title: 'Learn', body: 'Take Host Foundations, free and self-paced. Four short weeks on the PULSE rhythm.' },
  { icon: 'heart', title: 'Learn to care', body: 'Take Safe and Well Held: agreements, consent and what to do when something comes up.' },
  { icon: 'users', title: 'Co-host', body: 'Run two circles beside a trained host. Lead one beat, then two, then the whole night.' },
  { icon: 'award', title: 'Host', body: 'Open your own circle with a mentor on call, then join the monthly Host Circle.' },
]

// ── Journeys (the e-learning) ─────────────────────────────────────────────────────────────────
type Lesson = { title: string; body: string; minutes: number; type?: 'lesson' | 'reading' | 'exercise' | 'reflection' | 'resource' }
type Module = { title: string; body: string; lessons: Lesson[] }
export interface SeedJourney {
  key: string
  slug: string
  title: string
  summary: string
  intro: string
  category: string
  difficulty: 'gentle' | 'standard'
  tags: string[]
  dailyMinutes: number
  sequential: boolean
  cover: string
  modules: Module[]
}

const AGREEMENT_LINES = AGREEMENTS.map((a) => `- ${a.title}. ${a.body}`).join('\n')

export const JOURNEYS: SeedJourney[] = [
  {
    key: 'foundations',
    slug: 'host-foundations',
    title: 'Host Foundations',
    summary: 'Four short weeks on the craft every Frequency host shares: why we gather, the PULSE rhythm, setting the room, and running your first circle.',
    intro:
      "Hosting is a learnable skill. You don't need to be a teacher or a therapist. You need a clear purpose, a rhythm people can trust, and the nerve to start and end on time.\n\nThis course walks you through the PULSE rhythm every Frequency gathering follows: Presence, Unite, Lead, Settle, Exhale. One theme a week, a short practice to try, and a reflection to bring to your first co-hosted circle.",
    category: 'Hosting',
    difficulty: 'gentle',
    tags: ['hosting', 'facilitation', 'PULSE', 'circles', 'host training'],
    dailyMinutes: 15,
    sequential: true,
    cover: PHOTOS.circle,
    modules: [
      {
        title: 'Week 1 · Why we gather',
        body: 'A gathering with a clear purpose is easier to host and easier to come back to.',
        lessons: [
          { title: 'Name the purpose', minutes: 10, body: "Every good gathering answers one question: what is this for? Not 'connection' or 'community' in general, but something specific enough that someone could disagree with it.\n\nTry it: finish this sentence for a circle you'd like to host. \"We gather so that ___.\" Then cut it until it fits on one line." },
          { title: 'Generous authority', minutes: 10, type: 'reading', body: "Hosts often hold back so they don't seem bossy. Priya Parker calls the better way generous authority: using your role to protect your guests, connect them to each other, and keep everyone roughly equal for the time you're together.\n\nIn practice that means you set the agreements, you keep the time, and you gently step in when one voice starts to fill the room. A chill host leaves people to fend for themselves. A generous one takes care of them." },
          { title: 'Reflect: the best room you were ever in', minutes: 10, type: 'reflection', body: 'Think of a gathering where you felt truly welcome. What did the host do before it started, at the door, and at the end? Write down three things you want to borrow.' },
        ],
      },
      {
        title: 'Week 2 · The PULSE rhythm',
        body: 'Five beats, the same order every time, so anyone can walk into any Frequency circle and know where they are.',
        lessons: [
          ...PULSE.map((b) => ({ title: `${b.letter} · ${b.title} (${b.minutes})`, minutes: 8, body: `${b.body}\n\nWhat the host does: ${b.host}` })),
          { title: 'Practice: time a 90-minute night', minutes: 15, type: 'exercise' as const, body: 'Use the five beats to plan a 90-minute circle on paper: 10, 20, 35, 15 and 10 minutes. Write one line for what happens in each beat. Then cut ten minutes from Lead and see what you would keep.' },
        ],
      },
      {
        title: 'Week 3 · Setting the room',
        body: 'Most of hosting happens before anyone speaks.',
        lessons: [
          { title: 'Chairs in a circle', minutes: 8, body: "Set one circle with no back row, and no more seats than you expect people. Empty chairs feel like absence. Put something simple in the middle so people have a place to rest their eyes.\n\nCheck the room 20 minutes early: light, temperature, water, a sign on the door, and a place for phones." },
          { title: 'The talking piece', minutes: 8, type: 'reading', body: "A talking piece is any object passed hand to hand. Whoever holds it speaks. Everyone else listens. It slows a room down and gives quiet people a real turn.\n\nThe Way of Council offers four intentions worth teaching your circle: speak from the heart, listen from the heart, speak without rehearsing, and keep it lean so everyone gets a turn." },
          { title: 'Reading the agreements', minutes: 8, body: `Read the agreements out loud at the start of every circle, even when everyone has heard them before. It takes a minute and it's what makes the room safe enough to be honest.\n\n${AGREEMENT_LINES}` },
        ],
      },
      {
        title: 'Week 4 · Your first circle',
        body: 'Plan it, run it, close it, follow up.',
        lessons: [
          { title: 'Write your run sheet', minutes: 15, type: 'exercise', body: 'One page. The purpose in one line. The five beats with times. The check-in question. The Lead practice, with an opt-out. The closing line. Who to call if something comes up.' },
          { title: 'Closing on time', minutes: 6, body: "Ending well matters as much as starting well. Give a five-minute signal, close with one word each, say thank you, and say clearly when and where you'll meet next. Then stop." },
          { title: 'The follow-up', minutes: 6, body: 'Within a day, send one short note: thank you, the next date, and one line about what you noticed. Mark attendance in Frequency so you know who came back.' },
          { title: 'Reflect: what will you keep?', minutes: 10, type: 'reflection', body: "After your first co-hosted circle, write three lines. What worked. What you'd change. What you need help with. Bring them to your mentor." },
        ],
      },
    ],
  },
  {
    key: 'care',
    slug: 'safe-and-well-held',
    title: 'Safe and Well Held',
    summary: 'Agreements, consent and care: how to keep a room safe enough to be honest, and what to do when something comes up.',
    intro:
      "A circle only feels free when it feels safe. Safety isn't left to a host's instinct. It's designed in: clear agreements, real choice, and a plan for the moment someone needs more than the room can give.\n\nThis course is grounded in the six principles of a trauma-informed approach. It won't make you a therapist, and it isn't meant to. It will help you host in a way that does no harm and knows when to refer.",
    category: 'Hosting',
    difficulty: 'standard',
    tags: ['hosting', 'consent', 'safety', 'trauma-informed', 'host training'],
    dailyMinutes: 15,
    sequential: true,
    cover: PHOTOS.huddle,
    modules: [
      {
        title: 'Trauma-informed basics',
        body: "What it means, and what it doesn't.",
        lessons: [
          { title: 'Not therapy, still careful', minutes: 8, type: 'reading', body: "Trauma-informed hosting doesn't mean diagnosing anyone or assuming everyone in the room has been through something. It means giving people clarity, choice and voice, and taking away needless sources of stress." },
          ...PRINCIPLES.map((p) => ({ title: p.title, minutes: 5, body: p.body })),
        ],
      },
      {
        title: 'Agreements and consent',
        body: 'The few lines that make honesty possible.',
        lessons: [
          { title: 'The six agreements', minutes: 8, body: AGREEMENT_LINES },
          { title: 'Invitation, never instruction', minutes: 8, body: "Phrase every practice as an invitation with a way out: \"If you'd like to, close your eyes. Eyes open is fine too.\" Offer three ways in: join, go gently, or watch. Then mean it. Never single out the person who passes." },
          { title: 'Touch and closeness', minutes: 6, body: "Ask before any touch, every time, and accept no as easily as yes. Offer a no-touch version of every partner practice. Nothing sexual happens in a Frequency circle, and that's said out loud." },
        ],
      },
      {
        title: 'When something comes up',
        body: 'Tears, disclosures, a dominant voice, a room that goes cold.',
        lessons: [
          { title: 'Strong feelings in the room', minutes: 8, body: "Tears aren't an emergency. Slow down, let the person finish, thank them, and offer a breath for the whole circle. Don't rush to fix or move on. If someone seems overwhelmed, offer a simple choice: stay, step out with a co-host, or take a pause." },
          { title: 'A disclosure', minutes: 10, body: "If someone shares something that suggests they're at risk or someone else is, thank them, don't press for details in the circle, and speak with them privately afterwards. Know your local crisis line and share it. In the US, call or text 988. If anyone is in immediate danger, call emergency services." },
          { title: 'One voice filling the room', minutes: 8, body: 'Protect the circle with warmth: "Thank you. Let\'s hear from someone who hasn\'t spoken yet." Use the talking piece. Set a time per share before the round starts, not after it runs long.' },
          { title: 'Your referral route', minutes: 10, type: 'exercise', body: 'Write it down before you host: the local crisis line, two counselors or clinics you can name, and the Frequency contact you call after a hard night. Keep it on your run sheet.' },
        ],
      },
      {
        title: 'Caring for the host',
        body: "You can't keep a room you're too depleted to sit in.",
        lessons: [
          { title: 'After a hard night', minutes: 6, body: "Debrief with your co-host or mentor within a day. Say what happened, what you did, and what you're still carrying. Hosting is a team practice, not a solo act." },
          { title: 'Reflect: your limits', minutes: 10, type: 'reflection', body: "What kinds of shares are hardest for you to hear? What will you do in the moment, and who will you call afterwards?" },
        ],
      },
    ],
  },
  {
    key: 'formats',
    slug: 'circle-formats',
    title: 'The Three Circle Formats',
    summary: 'Open, Community and Focus Circles: what each one is for, what the host does, and how to choose.',
    intro: 'Every Frequency circle runs on the same PULSE rhythm. What changes is the format: how much the host teaches, how big the room gets, and what brings people back. Learn all three, then pick the one that fits the people you want to gather.',
    category: 'Hosting',
    difficulty: 'gentle',
    tags: ['hosting', 'circles', 'formats', 'host training'],
    dailyMinutes: 10,
    sequential: false,
    cover: PHOTOS.rugs,
    modules: [
      ...FORMATS.map((f) => ({
        title: f.name,
        body: `${f.size} · ${f.length}`,
        lessons: [
          { title: `${f.name}: what it is`, minutes: 6, body: f.blurb },
          { title: 'What the host does', minutes: 6, body: f.host },
          { title: 'When to choose it', minutes: 5, body: f.good },
        ],
      })),
      {
        title: 'Choosing your format',
        body: 'Start where the people are.',
        lessons: [
          { title: 'Pick one and start', minutes: 10, type: 'exercise', body: 'Write down who you want in the room and why they would come back. If they mainly need to be heard, start an Open Circle. If they share a season of life, a Community Circle. If you have a practice to teach, a Focus Circle. Set a date before you feel ready.' },
        ],
      },
    ],
  },
  {
    key: 'apprenticeship',
    slug: 'co-host-apprenticeship',
    title: 'Co-host Apprenticeship',
    summary: 'Learn by doing: shadow a trained host, co-lead two circles, then host your own with a mentor on call.',
    intro: "Nobody learns to host from reading. The apprenticeship pairs you with a trained Frequency host. You'll watch one circle, lead part of the next, lead most of the one after, and then host your own while your mentor is a call away.",
    category: 'Hosting',
    difficulty: 'standard',
    tags: ['hosting', 'mentorship', 'apprenticeship', 'host training'],
    dailyMinutes: 10,
    sequential: true,
    cover: PHOTOS.armsOut,
    modules: [
      { title: 'Shadow', body: 'Watch a trained host run a full circle.', lessons: [
        { title: 'Watch for the beats', minutes: 10, type: 'exercise', body: 'Sit in as a participant. Afterwards, write down when each PULSE beat started and one thing the host did to make it work.' },
        { title: 'Debrief with your mentor', minutes: 15, body: 'Ask your mentor what they were paying attention to that you could not see from your seat.' },
      ] },
      { title: 'Co-lead', body: 'Lead one beat, then two.', lessons: [
        { title: 'Lead Presence and Exhale', minutes: 10, type: 'exercise', body: 'In your second circle, open and close the night. Your mentor runs the middle.' },
        { title: 'Lead Unite and Lead', minutes: 10, type: 'exercise', body: 'In your third circle, run the check-in round and the practice. Your mentor opens, settles and closes.' },
      ] },
      { title: 'Host with a mentor', body: 'Your circle, your run sheet, your mentor on call.', lessons: [
        { title: 'Your first full circle', minutes: 15, type: 'exercise', body: 'Host the whole night from your run sheet. Your mentor is reachable by phone and checks in the next day.' },
        { title: 'Reflect and sign off', minutes: 10, type: 'reflection', body: 'Write what worked, what you would change and what you still want help with. Your mentor marks you ready to host on your own.' },
      ] },
      { title: 'Keep growing', body: 'Hosting gets easier with company.', lessons: [
        { title: 'Join the monthly Host Circle', minutes: 5, body: 'Hosts meet once a month to practice, swap run sheets and talk through hard nights. Bring a question.' },
      ] },
    ],
  },
  BOC_101,
]

// ── Page docs (New World blocks, the props lib/sites/kits/new-world-variants.ts writes) ────────
type Block = { type: string; props: Record<string, unknown> }
const doc = (blocks: Block[]) => ({ root: { props: {} }, content: blocks })
let n = 0
const id = (key: string) => `fh-${key}-${(n++).toString(36)}`
const reg = { register: 'auto' }

const CLOSER = (key: string, over: Partial<Record<'title' | 'primaryLabel' | 'primaryHref' | 'secondaryLabel' | 'secondaryHref', string>> = {}): Block => ({
  type: 'NewWorldCloser',
  props: { id: id(`closer-${key}`), aside: 'Generous structure. Real care. On time.', title: 'Pick a door. *Come in.*', primaryLabel: 'Ask the community', primaryHref: FORUM, secondaryLabel: 'Get help', secondaryHref: TICKET, note: '', ...over, ...reg },
})
const TRAINING_CLOSER = (key: string) => CLOSER(key, { title: 'Start with one *circle.*', primaryLabel: 'Start Host Foundations', primaryHref: JOURNEY('host-foundations'), secondaryLabel: 'See all courses', secondaryHref: PAGE('creator-lab') })

const FAQ_ROWS = [
  { question: 'What is this Space?', answer: "The Frequency team's own Space: our programs, host training, Creator Lab, the help desk and a community forum, in one place. Follow it to hear what's new." },
  { question: 'How do I get help with my account?', answer: 'Open a help ticket from the help desk. A real person reads every one, and you can follow the reply from your tickets.' },
  { question: 'Do I need experience to host?', answer: 'No. Most Frequency hosts started as guests. Host Foundations and the apprenticeship take you from your first seat in the circle to running your own.' },
  { question: 'Can my organization train its own hosts here?', answer: 'Yes. The courses and the PULSE rhythm are built so partner organizations and volunteers can use them for their own in-person and online groups.' },
  { question: 'Where do I ask other members a question?', answer: 'In the community forum. Post a question, share what worked, or say hello. Hosts and the team read it too.' },
]

const HELP_FAQ = [
  { question: 'How do I open a help ticket?', answer: 'Go to Help and support, describe what happened, and send it. You can follow every reply from your tickets on the same page.' },
  { question: 'Something feels unsafe. What do I do?', answer: 'Use Report on the post, profile or event, or open a ticket marked safety. If anyone is in immediate danger, call emergency services first.' },
  { question: 'I have a billing question.', answer: 'Open a ticket and choose billing. Include the email on your account so we can find it quickly.' },
  { question: 'How do I start a Space for my business or group?', answer: 'Read Running a Space in the help center, then create one from the Spaces page. The help desk can walk you through it.' },
  { question: 'Can I suggest a feature?', answer: 'Yes, please. Post it in the community forum so others can add to it, or open a ticket if it is about your own account.' },
]

const AGREEMENT_BLOCK = (key: string, index: string): Block => ({ type: 'NewWorldPromises', props: { id: id(`${key}-agreements`), index, eyebrow: 'Read at every circle', title: 'Six *agreements.*', lede: '', rows: AGREEMENTS, ...reg } })

export function buildPageDocs(): Record<string, unknown> {
  const home = doc([
    {
      type: 'NewWorldHero',
      props: {
        id: id('home-hero'),
        eyebrow: 'Frequency · Programs, training and help',
        title: 'Gather like it *matters.*',
        lead: "The home base for everyone building Frequency. Find our programs, learn to host on the PULSE rhythm, get help from a real person, and ask the community anything. Start wherever you are.",
        primaryLabel: 'Explore programs', primaryHref: PAGE('programs'),
        secondaryLabel: 'Get help', secondaryHref: PAGE('help'),
        proof: 'Run by the Frequency team, for members, hosts and Spaces.',
        aside: 'We build circles, not walls.',
        image: PHOTOS.circle, alt: ALT.circle, badge: 'Open to everyone',
        useEvents: true,
        rows: [
          { weekday: 'Help', mon: 'Desk', day: '1', title: 'Open a help ticket', body: 'A real person reads every ticket.', time: 'Any time', where: 'Online', spots: 'Open', kind: 'session', href: TICKET },
          { weekday: 'Course', mon: 'Free', day: '2', title: 'The Business of Community 101', body: 'Run your community like it’s going to last. Four weeks, free for every Space.', time: '4 weeks · about an hour each', where: 'Online', spots: 'Open', kind: 'session', href: JOURNEY(BOC_SLUG) },
          { weekday: 'Course', mon: 'Free', day: '3', title: 'Host Foundations', body: JOURNEYS[0]!.summary, time: 'Self-paced · 4 parts', where: 'Online', spots: 'Open', kind: 'session', href: JOURNEY('host-foundations') },
        ],
        ...reg,
      },
    },
    {
      type: 'NewWorldStats',
      props: {
        id: id('home-stats'),
        items: [
          { icon: 'heart', value: '4', label: 'Pillars', note: 'Mind, Body, Spirit, Expression' },
          { icon: 'users', value: '5', label: 'beats in every circle', note: 'Presence, Unite, Lead, Settle, Exhale' },
          { icon: 'calendar', value: '4', label: 'host courses', note: 'Three free online, one in person' },
          { icon: 'check', value: '1', label: 'help desk', note: 'A real person answers' },
        ],
        ...reg,
      },
    },
    {
      type: 'NewWorldPromises',
      props: {
        id: id('home-doors'), index: '01', eyebrow: 'Inside', title: 'Five *doors.*', lede: 'Everything the Frequency team runs for members, hosts and Spaces.',
        rows: [
          { icon: 'award', title: 'Programs', body: 'The Quest, Circles, events and host training: the structured ways to take part.' },
          { icon: 'heart', title: 'Host training', body: 'Free courses on the PULSE rhythm, care and consent, and the three circle formats.' },
          { icon: 'check', title: 'Help desk', body: 'Open a ticket, browse the help center, or report something that feels off.' },
          { icon: 'sparkle', title: 'Creator Lab', body: 'Business and leadership for the people who gather others. Starts with The Business of Community 101.' },
          { icon: 'users', title: 'Community forum', body: 'Ask a question, share what worked, suggest a feature. Hosts and the team read it.' },
        ],
        ...reg,
      },
    },
    {
      type: 'NewWorldStory',
      props: {
        id: id('home-story'),
        index: '02', eyebrow: 'A community collective', title: 'Built by *its members.*',
        paragraphs: [
          'Frequency is a community collective, not just an app. The software helps people find each other and helps local hosts and businesses run their rooms. The point is the room.',
          'We grow town by town, one circle at a time. Every one of those circles needs someone who arrives early, sets the chairs, starts on time and makes the new person feel expected.',
          'This Space is where that work is shared in the open: the programs, the training, the answers and the conversation.',
        ],
        buttonLabel: 'Our story', buttonHref: PAGE('about'),
        secondaryLabel: 'Ask the community', secondaryHref: FORUM,
        image: PHOTOS.rugs, alt: ALT.rugs,
        quote: 'The structure exists to serve the circle.', quoteBy: 'Daniel Tyack · Founder',
        ...reg,
      },
    },
    { type: 'SpacePractices', props: { id: id('home-journeys'), eyebrow: 'Learn here', heading: 'Courses to start', practicesHeading: 'Practices', journeysHeading: 'Courses', only: '' } },
    {
      type: 'NewWorldProcess',
      props: { id: id('home-path'), index: '03', eyebrow: 'Host training', title: 'From guest to *host.*', lede: '', rows: PATH, ...reg },
    },
    {
      type: 'NewWorldGallery',
      props: {
        id: id('home-gallery'), index: '04', eyebrow: 'Real circles', title: 'Rooms people *come back to.*', lede: 'Photos from Frequency gatherings.',
        images: [
          { image: PHOTOS.armsOut, alt: ALT.armsOut },
          { image: PHOTOS.huddle, alt: ALT.huddle },
          { image: PHOTOS.parachute, alt: ALT.parachute },
          { image: PHOTOS.beachCircle, alt: ALT.beachCircle },
          { image: PHOTOS.sunset, alt: ALT.sunset },
        ],
        ...reg,
      },
    },
    { type: 'NewWorldFaq', props: { id: id('home-faq'), index: '05', eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.', phone: '', email: EMAIL, hours: '', areasLabel: '', areas: [], rows: FAQ_ROWS, ...reg } },
    CLOSER('home'),
  ])

  const programs = doc([
    { type: 'NewWorldPageHead', props: { id: id('programs-head'), index: '', eyebrow: 'Frequency Programs', title: 'Show up. *Come back.*', lede: 'Frequency Programs are the structured ways to take part: The Quest, Circles, local events and host training. Start with one.', ...reg } },
    {
      type: 'NewWorldWayRows',
      props: {
        id: id('programs-rows'), costLabel: 'For', whenLabel: 'Rhythm', buttonLabel: 'Start', buttonHref: '/circles', secondaryLabel: 'Questions', secondaryHref: PAGE('help'),
        rows: PROGRAMS.map((p) => ({ icon: p.icon, tags: 'Program', name: p.name, body: p.body, price: p.who, when: p.rhythm, image: p.image, alt: p.alt, buttonLabel: p.button, href: p.href })),
        ...reg,
      },
    },
    { type: 'NewWorldPromises', props: { id: id('programs-pillars'), index: '01', eyebrow: 'The Quest', title: 'Four *Pillars.*', lede: 'Every practice and Journey sits under one Pillar, so you build the same strengths all year in different forms.', rows: PILLARS, ...reg } },
    {
      type: 'NewWorldProcess',
      props: {
        id: id('programs-quest'), index: '02', eyebrow: 'How The Quest works', title: 'Small things, *every day.*', lede: '',
        rows: [
          { icon: 'calendar', title: 'Pick a Journey', body: 'Choose one under a Pillar. Each has a few minutes of practice a day.' },
          { icon: 'check', title: 'Practice daily', body: 'Log it when you do it. Streaks build, and misses are part of it.' },
          { icon: 'users', title: 'Bring your Circle', body: 'Take a Journey with your Circle and show up for each other in person.' },
          { icon: 'award', title: 'Earn as you go', body: 'Zaps and Gems for showing up, a Pillar Trophy when you finish a Journey.' },
        ],
        ...reg,
      },
    },
    CLOSER('programs', { title: 'Start with *one.*', primaryLabel: 'Find a Circle', primaryHref: '/circles', secondaryLabel: "See what's happening", secondaryHref: '/events' }),
  ])

  const training = doc([
    { type: 'NewWorldPageHead', props: { id: id('training-head'), index: '', eyebrow: 'Host training', title: 'Host the room people *come back to.*', lede: 'Three free online courses and an in-person apprenticeship. Learn the PULSE rhythm, keep a room safe, pick your format, then co-host with a trained host.', ...reg } },
    {
      type: 'NewWorldWayRows',
      props: {
        id: id('training-rows'), costLabel: 'Cost', whenLabel: 'Length', buttonLabel: 'Start', buttonHref: JOURNEY('host-foundations'), secondaryLabel: 'Questions', secondaryHref: PAGE('help'),
        rows: JOURNEYS.filter((j) => j.slug !== BOC_SLUG).map((j, i) => ({
          icon: ['calendar', 'heart', 'users', 'award'][i], tags: i === 3 ? 'In person' : 'Online · self-paced', name: j.title, body: j.summary,
          price: i === 3 ? 'Ask us' : 'Free', when: i === 3 ? 'Three circles' : `${j.modules.length} parts`, image: j.cover, alt: '',
          buttonLabel: i === 3 ? 'Ask about a mentor' : 'Start the course', href: JOURNEY(j.slug),
        })),
        ...reg,
      },
    },
    { type: 'SpacePractices', props: { id: id('training-journeys'), eyebrow: 'Live courses', heading: 'Enroll from here', practicesHeading: 'Practices', journeysHeading: 'Courses', only: '' } },
    {
      type: 'NewWorldProcess',
      props: { id: id('pulse-beats'), index: '01', eyebrow: 'The PULSE rhythm · for everyone', title: 'What each beat *is.*', lede: '', rows: PULSE.map((b, i) => ({ icon: ['heart', 'users', 'award', 'check', 'message'][i], title: `${b.letter} · ${b.title}`, body: b.body })), ...reg },
    },
    {
      type: 'NewWorldFirstVisit',
      props: { id: id('pulse-host'), index: '02', eyebrow: 'The PULSE rhythm · for the host', title: 'What you *do.*', lede: 'A 90-minute night, beat by beat.', note: 'Shorter night? Trim Lead first. Never skip Exhale.', rows: PULSE.map((b) => ({ title: `${b.title} · ${b.minutes}`, body: b.host })), ...reg },
    },
    {
      type: 'NewWorldPromises',
      props: {
        id: id('training-formats'), index: '03', eyebrow: 'One rhythm', title: 'Three *formats.*', lede: 'Every circle runs on PULSE. The format decides how much you teach and how big the room gets.',
        rows: FORMATS.map((f, i) => ({ icon: ['users', 'heart', 'award'][i], title: `${f.name} · ${f.size}`, body: `${f.blurb} ${f.host}` })),
        ...reg,
      },
    },
    AGREEMENT_BLOCK('training', '04'),
    {
      type: 'NewWorldFirstVisit',
      props: {
        id: id('training-care'), index: '05', eyebrow: 'When something comes up', title: 'Safe enough *to be honest.*', lede: 'Our training follows the six principles of a trauma-informed approach: safety, trust and transparency, peer support, collaboration, choice and voice, and culture and context.',
        note: 'A Frequency circle is practice and community, not therapy or crisis care. In the US, call or text 988 for the Suicide and Crisis Lifeline. If anyone is in immediate danger, call emergency services.',
        rows: [
          { title: 'Strong feelings', body: "Slow down. Let the person finish, thank them, and offer a breath for the whole circle. Tears aren't an emergency." },
          { title: 'A disclosure', body: "Thank them, don't press for details in the circle, and speak privately afterwards. Share the local crisis line." },
          { title: 'One voice filling the room', body: 'Use the talking piece. Set a time per share before the round starts. Invite someone who hasn’t spoken yet.' },
          { title: 'After a hard night', body: 'Debrief with your co-host or mentor within a day. Hosting is a team practice.' },
        ],
        ...reg,
      },
    },
    TRAINING_CLOSER('training'),
  ])

  const creatorLab = doc([
    { type: 'NewWorldPageHead', props: { id: id('lab-head'), index: '', eyebrow: 'Creator Lab', title: 'Run your community like it’s *going to last.*', lede: "Creator Lab is Frequency's business and leadership track for the people who gather others. It starts with The Business of Community 101: free for every Space, with a weekly room on Zoom for paid Spaces.", ...reg } },
    {
      type: 'NewWorldWayRows',
      props: {
        id: id('lab-rows'), costLabel: 'For', whenLabel: 'Rhythm', buttonLabel: 'Start the course', buttonHref: JOURNEY(BOC_SLUG), secondaryLabel: 'Questions', secondaryHref: PAGE('help'),
        rows: [
          { icon: 'calendar', tags: 'Free · 4 weeks', name: 'The Business of Community 101', body: 'Four weeks: The Engine, The Container, The Gathering, The Exchange. Five short lessons a week, about an hour, ending in one commitment.', price: 'Every Space', when: 'One week at a time', image: PHOTOS.rugs, alt: ALT.rugs, buttonLabel: 'Start the course', href: JOURNEY(BOC_SLUG) },
          { icon: 'users', tags: 'Free · monthly start', name: 'This month’s start', body: 'Everyone who starts this month moves through it together. A thread to share what you tried, and someone noticing when you don’t.', price: 'Every Space', when: 'Starts each month', image: PHOTOS.huddle, alt: ALT.huddle, buttonLabel: 'Join this month', href: CIRCLE(START_CIRCLE_SLUG) },
          { icon: 'message', tags: 'Paid Spaces · Zoom', name: 'Business Hours', body: 'Same hour every week. Bring one number and one stuck thing. Commitments read back, one hot seat, a work block, and a new if-then.', price: 'Paid Spaces', when: 'Tuesdays · 10 AM Pacific', image: PHOTOS.cafe, alt: ALT.cafe, buttonLabel: 'See the calendar', href: PAGE('calendar') },
          { icon: 'award', tags: 'Paid Spaces · Zoom', name: 'Live cohort', body: 'Eight to twelve Space owners, four weekly 2.5-hour workshops, ending in the Certified capstone. The pilot runs this December.', price: 'Paid Spaces', when: 'Four weeks', image: PHOTOS.armsOut, alt: ALT.armsOut, buttonLabel: 'Ask for a seat', href: TICKET },
        ],
        ...reg,
      },
    },
    {
      type: 'NewWorldProcess',
      props: { id: id('lab-sessions'), index: '01', eyebrow: 'The Business of Community 101', title: 'Four weeks. *One idea each.*', lede: 'Each one fixes something that breaks in real life, and ends with you doing it inside your own Space.', rows: BOC_PAGE_SESSIONS.map((x, i) => ({ icon: ['calendar', 'check', 'users', 'heart'][i] ?? 'check', title: `Week ${x.n} · ${x.name}`, body: x.idea })), ...reg },
    },
    {
      type: 'NewWorldPlans',
      props: {
        id: id('lab-plans'), index: '02', eyebrow: 'What each Space gets', title: 'Free to learn. *More with a paid Space.*', lede: 'The course is free for everyone, always. Doing the builds needs a Space. Business Hours comes with a paid Space.', aside: 'Included with your plan. Nothing extra to buy.', featuredLabel: 'Most support',
        note: 'Plans and prices live on the pricing page.',
        rows: [
          { name: 'Every Space', body: 'The Business of Community 101, four weeks at your own pace. This month’s start. The forum and the help desk.', price: '', featured: false, buttonLabel: 'Start free', href: JOURNEY(BOC_SLUG) },
          { name: 'Paid Space', body: 'Everything free, plus Business Hours every week on Zoom, a seat in a live cohort, and your Certified capstone reviewed.', price: '', featured: true, buttonLabel: 'See plans', href: '/pricing' },
          { name: 'Certified', body: 'For Certified graduates: 102, six more sessions, when it opens.', price: '', featured: false, buttonLabel: 'How Certified works', href: JOURNEY(BOC_SLUG) },
        ],
        ...reg,
      },
    },
    {
      type: 'NewWorldFirstVisit',
      props: {
        id: id('lab-cert'), index: '03', eyebrow: 'Two ways to finish', title: 'Attended or *Certified.*', lede: '',
        note: 'Live sessions are on Zoom. The link goes to registered members before each call. A certificate of completion and competency, not an accredited certification.',
        rows: [
          { title: 'Attended', body: 'Finish all four weeks. Ten contact hours.' },
          { title: 'Certified', body: 'Submit The Community Book and finish the four builds inside your own Space. Named, written, tested: it survived a real gathering.' },
          { title: 'What you leave with', body: 'You know what a gathering costs you, what you charge, who came back, and who to text next week.' },
          { title: "What's next", body: '102, six more sessions, opens to Certified graduates.' },
        ],
        ...reg,
      },
    },
    { type: 'NewWorldQuote', props: { id: id('lab-quote'), label: 'The one idea', quote: 'The question is not how many came. It’s *how many came back.*', by: 'Daniel Tyack · Founder', ...reg } },
    CLOSER('creator-lab', { title: 'Start with *week one.*', primaryLabel: 'Start the course', primaryHref: JOURNEY(BOC_SLUG), secondaryLabel: 'Join this month', secondaryHref: CIRCLE(START_CIRCLE_SLUG) }),
  ])

  const help = doc([
    { type: 'NewWorldPageHead', props: { id: id('help-head'), index: '', eyebrow: 'Help desk', title: 'Ask. *A person answers.*', lede: 'Open a help ticket, browse the help center, or ask the community. Every ticket is read by a real person on the Frequency team.', ...reg } },
    {
      type: 'NewWorldWayRows',
      props: {
        id: id('help-rows'), costLabel: 'Cost', whenLabel: 'Best for', buttonLabel: 'Open a help ticket', buttonHref: TICKET, secondaryLabel: 'Common questions', secondaryHref: '#faq',
        rows: [
          { icon: 'message', tags: 'Help desk', name: 'Open a help ticket', body: 'Tell us what happened. Follow every reply from your tickets.', price: 'Free', when: 'Your account, billing, bugs', image: PHOTOS.cafe, alt: ALT.cafe, buttonLabel: 'Open a ticket', href: TICKET },
          { icon: 'check', tags: 'Help center', name: 'Browse the help center', body: 'Plain answers on Circles, events, Spaces, The Quest and membership.', price: 'Free', when: 'How-to questions', image: PHOTOS.garden, alt: ALT.garden, buttonLabel: 'Open the help center', href: '/help' },
          { icon: 'users', tags: 'Forum', name: 'Ask the community', body: 'Post a question or an idea. Members, hosts and the team answer.', price: 'Free', when: 'Ideas and how others do it', image: PHOTOS.huddle, alt: ALT.huddle, buttonLabel: 'Go to the forum', href: FORUM },
          { icon: 'heart', tags: 'Safety', name: 'Report a safety concern', body: 'Reporting, blocking and how moderation works. In an emergency, call emergency services first.', price: 'Free', when: 'Anything that feels unsafe', image: PHOTOS.fire, alt: ALT.fire, buttonLabel: 'Safety and reporting', href: '/help/safety' },
        ],
        ...reg,
      },
    },
    { type: 'NewWorldPosts', props: { id: id('help-center'), index: '01', eyebrow: 'Help center', title: 'Find it *fast.*', lede: 'Seven topics, written in plain words.', buttonLabel: 'Open the help center', buttonHref: '/help', rows: HELP_CATEGORIES.map((c) => ({ kind: c.kind, title: c.title, meta: '', href: c.href })), ...reg } },
    { type: 'NewWorldFaq', props: { id: id('help-faq'), index: '02', eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Still stuck? Open a ticket or email us.', phone: '', email: EMAIL, hours: '', areasLabel: '', areas: [], rows: HELP_FAQ, ...reg } },
    CLOSER('help', { title: 'Still stuck? *Ask us.*', primaryLabel: 'Open a help ticket', primaryHref: TICKET, secondaryLabel: 'Ask the community', secondaryHref: FORUM }),
  ])

  const about = doc([
    {
      type: 'NewWorldAboutHero',
      props: {
        id: id('about-hero'), eyebrow: `Our story · ${NAME}`, title: 'Build circles, *not walls.*',
        lead: 'Frequency is a community collective that spreads town by town through local hosts. This Space is where the team shares the programs, the training, the answers and the conversation in the open.',
        chips: [{ icon: 'check', text: 'Free to start' }, { icon: 'users', text: 'Run with its members' }, { icon: 'heart', text: 'Care designed in' }],
        primaryLabel: 'Explore programs', primaryHref: PAGE('programs'), secondaryLabel: 'Ask the community', secondaryHref: FORUM,
        image: PHOTOS.sunrise, alt: ALT.sunrise, name: 'Daniel Tyack', role: 'Founder', ...reg,
      },
    },
    {
      type: 'NewWorldLongStory',
      props: {
        id: id('about-roots'), index: '01', eyebrow: 'Where this comes from', title: 'Old practices, *plain words.*',
        paragraphs: [
          'Sitting in a circle and taking turns to speak is one of the oldest ways people have gathered. We did not invent it. We gave it a rhythm, PULSE, that a new host can learn in a week and a returning guest can trust.',
          'Our host training draws on a few sources worth reading in full. The Way of Council, as taught by Jack Zimmerman and Virginia Coyle, gives us the talking piece and its intentions. Parker Palmer and the Center for Courage and Renewal give us touchstones for trustworthy space, like no fixing and honest, open questions. Priya Parker gives us generous authority: a host who protects, connects and equalizes the room. SAMHSA gives us the six principles of a trauma-informed approach.',
          'Everything is written in plain words, because a host should be able to read an agreement aloud without explaining it.',
        ],
        ...reg,
      },
    },
    { type: 'NewWorldQuote', props: { id: id('about-quote'), label: 'In Daniel’s words', quote: 'The structure exists to serve the circle. The circle *governs the structure.*', by: 'Daniel Tyack · Founder', ...reg } },
    { type: 'NewWorldTeam', props: { id: id('about-team'), index: '02', eyebrow: 'The team', title: 'Who *runs this.*', lede: '', note: 'Trained hosts join this list as they become mentors.', rows: [{ name: 'Daniel Tyack', role: 'Founder · The Janitor', image: PHOTOS.daniel, alt: ALT.daniel }], ...reg } },
    CLOSER('about'),
  ])

  // CREATOR LAB IS THE LIBRARY (owner 2026-11-17: "merge host training"). One list of every course, the
  // track named in each row's small line, then the hosting reference the old Host training page carried.
  // The Business of Community has its own page (the sales page), so its row points there.
  type Row = Record<string, string>
  const labRows = (creatorLab.content[1].props.rows as Row[]).map((r, i) => ({
    ...r,
    tags: `Business · ${r.tags.replace(/^(Free|Paid Spaces) · /, '')}`,
    when: i === 0 ? '4 weeks' : r.when,
    price: i < 2 ? 'Free' : 'Paid Spaces',
    ...(i === 0 ? { buttonLabel: 'See the course', href: PAGE(BOC_SALES_META.slug) } : {}),
  }))
  const hostRows = (training.content[1].props.rows as Row[]).map((r) => ({ ...r, tags: `Hosting · ${r.tags.replace(' · self-paced', '')}` }))
  const hosting = training.content.slice(3, 8).map((blk, i) => ({ ...blk, props: { ...blk.props, index: String(i + 2).padStart(2, '0') } }))
  const library = doc([
    { type: 'NewWorldPageHead', props: { id: id('lib-head'), index: '', eyebrow: 'Creator Lab', title: 'Courses for the people who *gather others.*', lede: 'Free courses in two tracks: hosting the room, and running the community behind it. Start anywhere. Every course ends with you doing it for real.', ...reg } },
    {
      type: 'NewWorldPromises',
      props: {
        id: id('lib-tracks'), index: '01', eyebrow: 'The library', title: 'Two *tracks.*', lede: 'Each course is free. Paid Spaces add a weekly room on Zoom.',
        rows: [
          { icon: 'heart', title: 'Hosting', body: 'The PULSE rhythm, care and consent, the three circle formats, and an apprenticeship beside a trained host.' },
          { icon: 'sparkle', title: 'Business and leadership', body: 'The Business of Community: what a gathering costs you, what to charge, who came back, and who to text next week.' },
        ],
        ...reg,
      },
    },
    { type: 'NewWorldWayRows', props: { ...creatorLab.content[1].props, id: id('lib-rows'), costLabel: 'Cost', whenLabel: 'Length', buttonLabel: 'Start a course', buttonHref: PAGE(BOC_SALES_META.slug), rows: [...labRows, ...hostRows] } },
    ...hosting,
    CLOSER('creator-lab', { title: 'Start with *one course.*', primaryLabel: 'The Business of Community', primaryHref: PAGE(BOC_SALES_META.slug), secondaryLabel: 'Start Host Foundations', secondaryHref: JOURNEY('host-foundations') }),
  ])

  return { home, programs, 'creator-lab': library, [BOC_SALES_META.slug]: buildBocSalesDoc(), help, about }
}

// ── The house account (@frequency): the primary business profile ───────────────────────────────
// Profile columns the member editor writes (lib/profile-input.ts BIO_MAX 500), the contact card (lib/vcard.ts parseVcard), and the
// Spotlight (meta.spotlight: lib/spotlight/theme.ts THEME_PRESETS 'new-world' colours and type, the standard block layout
// validated by lib/spotlight/blocks/validate.ts). The New World kit layout is NOT used: it draws sample kit copy, not ours.
export const PROFILE = {
  display_name: 'Frequency',
  bio: "Gather like it matters. Frequency is a community collective: local Circles, events and the Spaces that host them. Programs, host training, Creator Lab, help and the community forum live in the Frequency Space. Need a hand? Open a help ticket and a real person answers.",
  website: SITE,
  avatar_url: LOGO,
  header_image_url: PHOTOS.circle,
  vcard: { enabled: true, email: EMAIL, phone: null, org: 'Frequency', title: 'Community collective', website: SITE, includeAvatar: true },
}

export function buildSpotlight(): Record<string, unknown> {
  const theme = { accent: '#1aa7c0', surface: '#111826', text: '#f2f5fa', font: { heading: 'display', body: 'sans' }, card: { radius: 'lg', shadow: 'soft', style: 'solid' }, header: { show: true, height: 200, focusY: 50 }, bg: { kind: 'solid', color: '#0a0e16' } }
  const blocks = [
    { id: 'fq_about', type: 'text', text: 'Frequency is a community collective. We help people find local Circles and events, and help hosts and Spaces run the rooms people come back to.' },
    { id: 'fq_help', type: 'links', items: [
      { label: 'Open a help ticket', url: `${SITE}${TICKET}` },
      { label: 'Help center', url: `${SITE}/help` },
      { label: 'Ask the community', url: `${SITE}${FORUM}` },
    ] },
    { id: 'fq_div1', type: 'divider' },
    { id: 'fq_hq', type: 'links', items: [
      { label: 'The Frequency Space', url: `${SITE}${PAGE()}` },
      { label: 'Creator Lab', url: `${SITE}${PAGE('creator-lab')}` },
      { label: 'Programs', url: `${SITE}${PAGE('programs')}` },
      { label: 'The Business of Community', url: `${SITE}${PAGE(BOC_SALES_META.slug)}` },
      { label: 'Find a Circle', url: `${SITE}/circles` },
      { label: "What's happening", url: `${SITE}/events` },
    ] },
    { id: 'fq_quote', type: 'quote', text: 'We build circles, not walls.', cite: 'Frequency' },
    { id: 'fq_div2', type: 'divider' },
    { id: 'fq_social', type: 'links', items: SOCIAL },
  ]
  return { enabled: true, published: true, theme, layout: { version: 1, blocks } }
}

// ── The in-app Space page (the module engine, ADR-508 U3) ──────────────────────────────────────
// The member-area Space Home renders `preferences.profileLayout` (resolveRows over the space kind), never a
// page doc, and its tabs are the fixed portal tabs. So the hub is drawn twice from the same words: this grid
// for members inside the app, and the New World website below for /sites/hq. Shape: scripts/seed-wildheart.mts.
export function buildProfileLayout(): Record<string, unknown> {
  return {
    rows: [
      { id: 'r0', columns: 1, cells: [['editorial']] },
      { id: 'r1', columns: 1, cells: [['links']], title: 'Start here', headerOn: true },
      { id: 'r2', columns: 1, cells: [['cardGrid']] },
      { id: 'r3', columns: 1, cells: [['practices']] },
      { id: 'r4', columns: 1, cells: [['zigzag']] },
      { id: 'r5', columns: 1, cells: [['offerings']] },
      { id: 'r6', columns: 1, cells: [['quote']] },
      { id: 'r7', columns: 1, cells: [['faq']] },
      { id: 'r8', columns: 1, cells: [['accentBeat']] },
      { id: 'r9', columns: 2, cells: [['contact'], ['team']], title: 'Contact and team', headerOn: true },
    ],
    content: {
      about: { eyebrow: 'About', title: 'About this Space', body: ABOUT },
      editorial: {
        eyebrow: 'The Frequency Space',
        title: 'Gather like it matters.',
        body: "This is the Frequency team's own Space: the home base for members, hosts and Spaces.<br><br>Find our programs, take free host training on the PULSE rhythm, open a help ticket when something breaks, and ask the community anything in the forum. Everything here is free to walk into.",
      },
      links: { items: [
        { label: 'Open a help ticket', url: TICKET },
        { label: 'Ask the community', url: FORUM },
        { label: 'Start host training', url: JOURNEY('host-foundations') },
        { label: 'Help center', url: '/help' },
        { label: 'Creator Lab', url: PAGE('creator-lab') },
        { label: 'Find a Circle', url: '/circles' },
      ] },
      cardGrid: {
        eyebrow: 'Inside',
        title: 'Five doors.',
        subtitle: 'Everything the Frequency team runs for members, hosts and Spaces.',
        columns: '3',
        shadow: false,
        cards: [
          { icon: '1', title: 'Programs', text: 'The Quest, Circles, events and host training: the structured ways to take part.' },
          { icon: '2', title: 'Host training', text: 'Free courses on the PULSE rhythm, care and consent, and the three circle formats.' },
          { icon: '3', title: 'Help desk', text: 'Open a ticket, browse the help center, or report something that feels off. A real person answers.' },
          { icon: '4', title: 'Creator Lab', text: 'Business and leadership for community creators, starting with The Business of Community 101. Free for every Space.' },
          { icon: '5', title: 'Community forum', text: 'Ask a question, share what worked, suggest a feature. Hosts and the team read it.' },
        ],
      },
      practices: { eyebrow: 'Learn here', title: 'Courses to start' },
      zigzag: {
        eyebrow: 'The PULSE rhythm',
        title: 'Five beats. Every circle.',
        body: PULSE.map((b) => `<b>${b.title}.</b> ${b.body}`).join('<br><br>'),
        image: PHOTOS.circle,
        alt: ALT.circle,
        mediaSide: 'right',
      },
      offerings: { eyebrow: 'Frequency Programs', title: 'Show up. Come back.' },
      quote: { text: 'The structure exists to serve the circle. The circle governs the structure.', by: 'Daniel Tyack · Founder' },
      faq: { eyebrow: 'Questions', title: 'Good to know' },
      accentBeat: { eyebrow: 'Help desk', title: 'Need a hand?', body: 'Open a help ticket and a real person on the Frequency team answers. You can follow every reply from your tickets.', buttonOn: true, buttonLabel: 'Open a help ticket', buttonUrl: TICKET },
      contact: { eyebrow: 'Contact', title: 'Reach the team' },
      team: { eyebrow: 'The team', title: 'Who runs this' },
    },
  }
}

/** FAQ rows for the module engine's FAQ block (space_faqs). Home's and the help desk's, deduped. */
export function buildFaqs(): { id: string; question: string; answer: string; position: number }[] {
  const seen = new Set<string>()
  return [...FAQ_ROWS, ...HELP_FAQ].filter((r) => !seen.has(r.question) && seen.add(r.question)).map((r, i) => ({ id: uuidFrom(`faq:${i}`), question: r.question, answer: r.answer, position: i }))
}

// ── The website (/sites/hq): the same six pages as a published New World site ─────────────────────
// lib/sites/editor/state.ts WebsiteSnapshot / WebsiteEditorState, the shape nextWebsiteState writes. Page links
// are Space paths; the site maps them to its own pages at render (siteLocalHref).
const SEO: Record<string, string> = {
  home: 'Frequency: programs, free host training, Creator Lab, a help desk and a community forum.',
  'creator-lab': 'Creator Lab: free courses for the people who gather others. Hosting on the PULSE rhythm, and The Business of Community.',
  programs: 'Frequency Programs: The Quest, Circles, local events and host training.',
  [BOC_SALES_META.slug]: BOC_SALES_META.seo.description,
  pulse: 'The PULSE rhythm: Presence, Unite, Lead, Settle, Exhale.',
  help: 'Open a help ticket, browse the help center, or ask the community.',
  about: 'Frequency is a community collective. Build circles, not walls.',
}
export function buildWebsiteEditor(now = new Date().toISOString()): Record<string, unknown> {
  const docs = buildPageDocs() as Record<string, unknown>
  const pages = PAGES.map((p) => ({ slug: p.slug, label: p.label, doc: docs[p.slug], seo: { title: p.slug === 'home' ? NAME : p.slug === BOC_SALES_META.slug ? BOC_SALES_META.seo.title : `${p.label} · ${NAME}`, description: SEO[p.slug] ?? TAGLINE }, comments: [] }))
  const snapshot = { theme: 'NewWorld', brand: { logo: LOGO, accent: ACCENT }, chrome: { name: NAME, tagline: TAGLINE, cta: { label: 'Get help', href: TICKET } }, pages }
  return { v: 1, revision: 1, draft: snapshot, published: structuredClone(snapshot), scheduled: null, versions: [{ id: '1', createdAt: now, author: 'Frequency', snapshot: structuredClone(snapshot) }] }
}

// ── Preferences ─────────────────────────────────────────────────────────────────────────────
// theme / siteStyle / megaTheme are planMegaTheme({}, 'new-world') verbatim (lib/theme/apply-mega-theme.ts).
const THEME_PREFS = { theme: 'modern', siteStyle: { theme: 'new-world', synced: true, spaceFonts: 'modern' }, megaTheme: { theme: 'new-world', niche: 'networks' } }

export function buildPreferences(): Record<string, unknown> {
  return {
    ...THEME_PREFS,
    pages: PAGES,
    pageDocs: buildPageDocs(),
    siteHero: {
      eyebrow: 'Frequency · Programs, training and help',
      heading: 'Gather like it *matters.*',
      tagline: 'Our programs, free host training, a help desk with real people and a community forum, in one place.',
      action: { label: 'Explore programs', href: PAGE('programs') },
      secondary: { label: 'Get help', href: PAGE('help') },
    },
    headerCta: { kind: 'custom', url: TICKET, label: 'Get help' },
    coverFocus: '50% 45%',
    coverScrim: 'none',
    coverSize: 'hero',
    logoBackdrop: 'none',
    profileLayout: buildProfileLayout(),
    websiteEditor: buildWebsiteEditor(),
    websitePublished: true,
    profileData: {
      about: ABOUT,
      kind: 'business',
      categoryLabel: 'Community collective',
      email: EMAIL,
      website: SITE,
      socials: [{ platform: 'website', url: SITE }, ...SOCIAL.map((x) => ({ platform: x.label.toLowerCase(), url: x.url }))],
      offerings: [
        ...PROGRAMS.map((p) => ({ title: p.name, blurb: p.body })),
        { title: 'Help desk', blurb: 'Open a help ticket and a real person on the Frequency team answers.' },
      ],
    },
    profilePublished: true,
  }
}

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────
const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)
const qj = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`
const qarr = (xs: string[]) => `array[${xs.map(q).join(', ')}]::text[]`

type ItemRow = { id: string; plan_id: string; block_type: string; parent_id: string | null; title: string; body: string | null; sort_order: number; required: boolean; est_minutes: number | null }

export function buildItems(): ItemRow[] {
  const rows: ItemRow[] = []
  for (const j of JOURNEYS) {
    const planId = uuidFrom(`journey:${j.key}`)
    j.modules.forEach((m, mi) => {
      const phase = uuidFrom(`${j.key}:phase:${mi}`)
      const mod = uuidFrom(`${j.key}:module:${mi}`)
      rows.push({ id: phase, plan_id: planId, block_type: 'phase', parent_id: null, title: m.title, body: m.body, sort_order: mi, required: true, est_minutes: null })
      rows.push({ id: mod, plan_id: planId, block_type: 'module', parent_id: phase, title: m.title.replace(/^Week \d+ · /, ''), body: m.body, sort_order: 0, required: true, est_minutes: null })
      m.lessons.forEach((l, li) => {
        rows.push({ id: uuidFrom(`${j.key}:lesson:${mi}:${li}`), plan_id: planId, block_type: l.type ?? 'lesson', parent_id: mod, title: l.title, body: l.body, sort_order: li, required: true, est_minutes: l.minutes })
      })
    })
  }
  return rows
}

export function renderSql(): string {
  const prefs = buildPreferences()
  const L: string[] = []
  const p = (...lines: string[]) => L.push(...lines)
  p(
    '-- scripts/seed-frequency-hosts.sql',
    '-- GENERATED by `pnpm seed:frequency-hosts --sql` from scripts/seed-frequency-hosts.mts. Edit the .mts, then regenerate.',
    '--',
    '-- Seeds FREQUENCY HQ (slug hq): the house account\'s program and info hub, help desk, community forum and host',
    '-- training on the New World theme, its six pages, its four training Journeys, @danieltyack as a Space admin, and',
    '-- the @frequency house profile (business details, contact card, Spotlight). ONE transaction, idempotent.',
    '-- pageDocs, pages, profileLayout and the website are written only while the Space has none, so owner edits survive.',
    '-- The website is published on first run only (websitePublished, like the pages, is never overwritten).',
    '',
    'begin;',
    '',
    'do $guard$ begin',
    `  if exists (select 1 from spaces where slug = ${q(SLUG)} and owner_profile_id is distinct from ${q(OWNER_ID)}) then`,
    `    raise exception 'seed-frequency-hosts: the slug ${SLUG} belongs to someone else; nothing written';`,
    '  end if;',
    'end $guard$;',
    '',
    '-- 0. One-time move (2026-11-17): the Space was first seeded as Frequency Hosts at /spaces/hosts. Same row, same id.',
    `update spaces set slug = ${q(SLUG)} where id = ${q(SPACE_ID)} and slug = 'hosts' and owner_profile_id = ${q(OWNER_ID)};`,
    ...(process.argv.includes('--replace-pages') ? ['-- --replace-pages: drop the stored pages so this run writes them fresh (only before the owner has edited them).', `update spaces set preferences = preferences - 'pageDocs' - 'pages' - 'profileLayout' - 'websiteEditor' where id = ${q(SPACE_ID)} and owner_profile_id = ${q(OWNER_ID)};`] : []),
    '',
    '-- 1. The Space (lib/spaces/provision.ts shape; a house Space: Collective plan, limits waived, comped).',
    'insert into spaces (id, slug, name, type, status, entity_id, skin, network_connected, visibility, plan, is_comped, limits_waived, entitlements, owner_profile_id, brand_name, brand_accent, tagline, about, time_zone, brand_logo_url, cover_image_url, preferences)',
    `values (${q(SPACE_ID)}, ${q(SLUG)}, ${q(NAME)}, 'business', 'active', (select entity_id from spaces where type = 'root' order by created_at limit 1), 'dawn', true, 'network', 'collective', true, true, '{}'::jsonb, ${q(OWNER_ID)}, ${q(NAME)}, ${q(ACCENT)}, ${q(TAGLINE)}, ${q(ABOUT)}, ${q(TZ)}, ${q(LOGO)}, ${q(PHOTOS.circle)}, ${qj(prefs)})`,
    "on conflict (slug) do update set name = excluded.name, status = 'active', network_connected = true, visibility = 'network', plan = excluded.plan, is_comped = excluded.is_comped, limits_waived = excluded.limits_waived, brand_name = excluded.brand_name, brand_accent = excluded.brand_accent, tagline = excluded.tagline, about = excluded.about, time_zone = excluded.time_zone, brand_logo_url = excluded.brand_logo_url, cover_image_url = excluded.cover_image_url,",
    "  preferences = coalesce(spaces.preferences, '{}'::jsonb) || (excluded.preferences - array['pageDocs', 'pages', 'profileLayout', 'websiteEditor', 'websitePublished']::text[]) || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(excluded.preferences) e(k, v) where k = any(array['pageDocs', 'pages', 'profileLayout', 'websiteEditor', 'websitePublished']::text[]) and not (coalesce(spaces.preferences, '{}'::jsonb) ? k)), updated_at = now()",
    `where spaces.owner_profile_id = ${q(OWNER_ID)};`,
    '',
    '-- 2. Members: the owner and @danieltyack, both Space admins (provision.ts seats the owner as admin).',
    'insert into space_members (space_id, profile_id, role, status)',
    `select s.id, m.pid, 'admin', 'active' from spaces s, (values (${q(OWNER_ID)}::uuid), (${q(ADMIN_ID)}::uuid)) m(pid) where s.slug = ${q(SLUG)}`,
    "on conflict (space_id, profile_id) do update set role = 'admin', status = 'active';",
    '',
    '-- 2b. FAQ rows the module engine\'s FAQ block reads (space_faqs).',
    'insert into space_faqs (id, space_id, question, answer, position) values',
    buildFaqs().map((f) => `(${q(f.id)}, (select id from spaces where slug = ${q(SLUG)}), ${q(f.question)}, ${q(f.answer)}, ${f.position})`).join(',\n'),
    'on conflict (id) do update set question = excluded.question, answer = excluded.answer, position = excluded.position, updated_at = now();',
    '',
    '-- 3. The training Journeys (journey_plans, scripts/seed-wildheart.mts shape), published on the Space.',
  )
  for (const j of JOURNEYS) {
    const meeting = { format: j.key === 'apprenticeship' ? 'in_person' : 'online', schedule: j.key === 'apprenticeship' ? 'Three circles with a trained host' : 'Self-paced', timezone: TZ, location: null, link: null, notes: null, eventId: null, gathering: null }
    p(
      'insert into journey_plans (id, slug, title, summary, intro, author_id, space_id, visibility, status, published_at, category, difficulty, tags, daily_minutes, enroll_cap, meeting, ongoing, drip_interval_days, sequential, cover_image, official)',
      `values (${q(uuidFrom(`journey:${j.key}`))}, ${q(j.slug)}, ${q(j.title)}, ${q(j.summary)}, ${q(j.intro)}, ${q(OWNER_ID)}, (select id from spaces where slug = ${q(SLUG)}), 'public', 'approved', now(), ${q(j.category)}, ${q(j.difficulty)}, ${qarr(j.tags)}, ${j.dailyMinutes}, null, ${qj(meeting)}, false, 0, ${j.sequential}, ${q(j.cover)}, true)`,
      'on conflict (slug) do update set title = excluded.title, summary = excluded.summary, intro = excluded.intro, space_id = excluded.space_id, visibility = excluded.visibility, status = excluded.status, published_at = coalesce(journey_plans.published_at, excluded.published_at), category = excluded.category, difficulty = excluded.difficulty, tags = excluded.tags, daily_minutes = excluded.daily_minutes, meeting = excluded.meeting, sequential = excluded.sequential, cover_image = excluded.cover_image, official = excluded.official, updated_at = now()',
      `where journey_plans.author_id = ${q(OWNER_ID)};`,
    )
  }
  p('', '-- 4. The phase / module / lesson tree (parents sort before children, so one insert satisfies parent_id).')
  const items = buildItems()
  p(
    'insert into journey_plan_items (id, plan_id, block_type, parent_id, title, body, sort_order, required, est_minutes) values',
    items.map((r) => `(${q(r.id)}, ${q(r.plan_id)}, ${q(r.block_type)}, ${r.parent_id ? q(r.parent_id) : 'null'}, ${q(r.title)}, ${q(r.body)}, ${r.sort_order}, ${r.required}, ${r.est_minutes ?? 'null'})`).join(',\n'),
    'on conflict (id) do update set block_type = excluded.block_type, parent_id = excluded.parent_id, title = excluded.title, body = excluded.body, sort_order = excluded.sort_order, required = excluded.required, est_minutes = excluded.est_minutes;',
  )
  p(
    '',
    '-- 5. The house account: the primary business profile. Only display fields; never community_role or web_role',
    '--    (prevent_role_self_escalation guards those, and a role grant goes through the admin action).',
    `update profiles set display_name = ${q(PROFILE.display_name)}, bio = ${q(PROFILE.bio)}, website = ${q(PROFILE.website)}, avatar_url = ${q(PROFILE.avatar_url)}, header_image_url = ${q(PROFILE.header_image_url)}, vcard = ${qj(PROFILE.vcard)},`,
    `  meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{spotlight}', ${qj(buildSpotlight())}), updated_at = now()`,
    `where id = ${q(OWNER_ID)} and handle = 'frequency';`,
  )
  p('', 'commit;', '')
  return L.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--sql')) process.stdout.write(renderSql())
  else console.error('Usage: pnpm seed:frequency-hosts --sql > scripts/seed-frequency-hosts.sql')
}
