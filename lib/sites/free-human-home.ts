import { freeHumanPhotoSrc } from '@/lib/sites/free-human-photos'

// THE HONEY HOME (code id free-human; the Free Human Movement design system, templates/website/Website.dc.html). PURE: no
// React, so the seed script and the editor template can import it.
//
// Every section of the design's Home is one registered Free Human block (components/page-editor/blocks/free-human.tsx), in the
// design's order: hero, seasons (the year-round program), the lyric band, workshops, events, books, speaking and lineage. The
// announce bar, header (mega menu, bag, account) and footer are site chrome, not blocks (lib/sites/free-human-chrome.ts).
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the accent italic (the design's `<em>`).
//
// GROUNDS. Each block carries `ground` (day, gold, night, sunset or sky), `edge` (how it meets its neighbours: flow, flow-top,
// flow-bottom or flat), `texture` (one elemental ground, or none) and `wander` (the drifting layer). They are the design's own
// registers, so an owner can re-pace a page without leaving the theme.
//
// GENERIC, AND IT COACHES (owner 2026-11-18: "Make every Frequency theme FULLY generic with copy that coaches them what to write.
// Be sure anybody using a theme keeps their content but give the templates a full scrub."). These are the Honey theme's template
// defaults: every line says what to write there, in the theme's own shape, and no line names a real person, book or date. They seed a
// new block or a new kit only; a saved page keeps its own words. The Free Human Movement Space's own words are its seed
// (lib/sites/free-human-movement-home.ts), not a template. Photos: Frequency's own plus the honey-light shots.

interface FreeHumanBlockSeed { type: string; props: Record<string, unknown> }

/** The served path of a select. */
const ph = freeHumanPhotoSrc

export const FREE_HUMAN_HERO = {
  ground: 'day', edge: 'flow-bottom', texture: 'none', wander: true,
  badge: 'Name what is opening next',
  title: 'Say what you help people *feel or do.*',
  lead: 'Name who this is for and the thing they are missing, then what changes when they join you. Two sentences is plenty.',
  primaryLabel: 'Name the first step', primaryHref: '~/program', primaryStyle: 'madder',
  secondaryLabel: 'See what is on', secondaryHref: '~/calendar',
  image: ph('fq-boc-circle-sunset'), alt: 'A circle of people standing together at sunset', pos: 'center 20%',
  eggImage: ph('light-honey-dipper'), sunImage: ph('light-sun'), pebbleImage: ph('fq-day-park-yoga'),
  rays: true,
}

export const FREE_HUMAN_SEASONS = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: true,
  eyebrow: 'Your program',
  title: 'Name your program *in a few words.*',
  lead: 'Say how it runs and when someone can start. Then give each part below its own name and one line about what happens there.',
  seasons: [
    { season: 'winter', name: 'Part one', glyph: 'moon', texture: 'water', body: 'Name it, then say in one line what someone does or feels here.', image: ph('light-floating-candles'), alt: 'Candles floating on dark water', pos: 'center', href: '~/program' },
    { season: 'spring', name: 'Part two', glyph: 'seedling', texture: 'plant', body: 'One line on what this part gives them that the first did not.', image: ph('fq-day-park-yoga'), alt: 'Yoga mats spread out on a park lawn', pos: 'center', href: '~/program' },
    { season: 'summer', name: 'Part three', glyph: 'sun', texture: 'fire', body: 'One line, in the words your people use for it.', image: ph('fq-boc-garden-rugs'), alt: 'Rugs laid out for a circle in a garden', pos: 'center', href: '~/program' },
    { season: 'fall', name: 'Part four', glyph: 'olive', texture: 'earth', body: 'One line on where they land when it is done.', image: ph('fq-boc-group-hug'), alt: 'Friends wrapped in a group hug', pos: 'center', href: '~/program' },
  ],
  buttonLabel: 'Name the first step', buttonHref: '~/program',
  badges: ['Say when people can start', 'Say how you meet'],
}

export const FREE_HUMAN_LYRIC = {
  ground: 'gold', edge: 'flow', texture: 'none', wander: true,
  line: 'Write the one line you would want someone to remember about your work.',
  feelings: [
    { glyph: 'love', label: 'Love' }, { glyph: 'joy', label: 'Joy' }, { glyph: 'grief', label: 'Grief' }, { glyph: 'anger', label: 'Anger' },
    { glyph: 'fear', label: 'Fear' }, { glyph: 'tender', label: 'Tenderness' }, { glyph: 'longing', label: 'Longing' }, { glyph: 'wonder', label: 'Wonder' },
  ],
  note: 'Say what people can bring with them.',
}

export const FREE_HUMAN_WORKSHOPS = {
  ground: 'paper', edge: 'flat', texture: 'earth', wander: false,
  eyebrow: 'Workshops',
  title: 'Name your workshops *in a few words.*',
  aside: 'Say who can come and what the room feels like.',
  tag: 'workshop', count: 3,
  rows: [
    { when: 'Date to come', mode: 'Online', title: 'Name the *workshop*', body: 'Say how long it runs, what happens and who it is for.', image: ph('light-honey-spoon'), pos: 'center 60%', shape: 'egg', href: '~/workshops' },
    { when: 'Date to come', mode: 'In person', title: 'Name the *next one*', body: 'One or two lines on what someone walks away with.', image: ph('fq-boc-lawn-rest'), pos: 'center 25%', shape: 'arch', href: '~/workshops' },
    { when: 'Date to come', mode: 'All ages', title: 'Name *one more*', body: 'Say who it is for and what to bring.', image: ph('fq-boc-craft-table'), pos: 'center', shape: 'circle', href: '~/workshops' },
  ],
  buttonLabel: 'Reserve',
}

export const FREE_HUMAN_EVENTS = {
  ground: 'night', edge: 'flow', texture: 'fire', wander: true,
  eyebrow: 'Gatherings & events',
  title: 'Say how to show up. *Make it easy.*',
  image: ph('light-lanterns'), alt: 'Many paper lanterns rising into the night sky', pos: 'center',
  count: 4,
  empty: 'No dates are open right now. Check back soon.',
  rows: [
    { glyph: 'gathering', title: 'Name your next gathering', meta: 'Online or in person · Who it is for', href: '~/calendar', featured: true },
    { glyph: 'full-moon', title: 'Full moon gathering', meta: 'In person · Say what happens there', href: '~/calendar' },
    { glyph: 'sun-sign', title: 'Solstice retreat', meta: 'How long · Where · What is included', href: '~/calendar' },
    { glyph: 'half-moon', title: 'Name one more date', meta: 'Online or in person · One line on it', href: '~/calendar' },
  ],
  buttonLabel: 'Reserve', calendarLabel: 'See the whole year on the calendar', calendarHref: '~/calendar',
}

export const FREE_HUMAN_BOOKS = {
  ground: 'sunset', edge: 'flow', texture: 'wind', wander: true,
  eyebrow: 'Your books, guides or recordings',
  title: 'Name what you have *made.*',
  books: [
    { title: 'Your *title*', subtitle: 'What it is, in a few words.', body: 'Say who it is for and the one thing it helps them do.', status: 'New', cover: 'jade', image: ph('fq-boc-backyard-craft'), pos: 'center 60%', rays: false, primaryLabel: 'Order now', primaryHref: '~/shop', secondaryLabel: 'Read a sample', secondaryHref: '~/books' },
    { title: 'The *next one*', subtitle: 'What it is, in a few words.', body: 'Say what is coming and when people can get it.', status: 'Coming soon', cover: 'oxblood', image: ph('fq-boc-circle-arms-up'), pos: 'center 15%', rays: true, primaryStyle: 'gilt', primaryLabel: 'Pre-order', primaryHref: '~/shop', secondaryLabel: 'Read a sample', secondaryHref: '~/books' },
  ],
}

export const FREE_HUMAN_SPEAKING = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: false,
  eyebrow: 'Your guide · Speaking',
  title: 'Your *name*',
  body: 'Say who you are and why you started this, in two or three sentences. Then name where you speak or teach and what you speak about.',
  image: ph('fq-day-meditation-circle'), alt: 'A meditation circle seated in the morning light', pos: 'center 22%',
  accentImage: ph('fq-boc-fire-meditation'), accentPos: 'center 30%',
  topics: [{ glyph: 'bloom', label: 'Your first topic' }, { glyph: 'seedling', label: 'A second topic' }, { glyph: 'sparkle', label: 'A third' }, { glyph: 'moon', label: 'One more' }],
  formTitle: 'Bring me *to your gathering.*',
  kinds: ['Conference or summit', 'Retreat', 'School or parent group', 'Podcast or interview', 'Something else'],
  buttonLabel: 'Request a booking',
  note: 'We write back to every request.',
  successMessage: 'Thank you. Your request is in, and a person reads every one.',
}

export const FREE_HUMAN_LINEAGE = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: false,
  eyebrow: 'Your roots',
  title: 'Name who *came before you.*',
  aside: 'Say whose work yours grows from, or what tradition you practice in.',
  photos: [
    { image: ph('fq-boc-writing-cushions'), alt: 'Notebooks and cushions laid out for a writing circle', pos: 'center 30%' },
    { image: ph('fq-boc-circle-dusk'), alt: 'A circle gathered at dusk', pos: 'center 20%' },
    { image: ph('fq-boc-small-circle'), alt: 'A small circle seated outdoors', pos: 'center 30%' },
    { image: ph('fq-night-string-lights-web'), alt: 'String lights over an evening gathering', pos: 'center 40%' },
    { image: ph('fq-boc-fire-night'), alt: 'People gathered around a fire at night', pos: 'center 45%' },
  ],
}

/** Home: the design's own order. */
export function freeHumanHomeBlocks(): FreeHumanBlockSeed[] {
  return [
    { type: 'FreeHumanHero', props: { ...FREE_HUMAN_HERO } },
    { type: 'FreeHumanSeasons', props: { ...FREE_HUMAN_SEASONS } },
    { type: 'FreeHumanLyric', props: { ...FREE_HUMAN_LYRIC } },
    { type: 'FreeHumanWorkshops', props: { ...FREE_HUMAN_WORKSHOPS } },
    { type: 'FreeHumanEvents', props: { ...FREE_HUMAN_EVENTS } },
    { type: 'FreeHumanBooks', props: { ...FREE_HUMAN_BOOKS } },
    { type: 'FreeHumanSpeaking', props: { ...FREE_HUMAN_SPEAKING } },
    { type: 'FreeHumanLineage', props: { ...FREE_HUMAN_LINEAGE } },
  ]
}

// THE CALENDAR PAGE (templates/website/Calendar.dc.html). The hero and the Calendar are LIVE: they read the Space's own events
// and expand its series across the next thirteen months, so a recurring circle shows on every week. An event's kind comes from its
// title (lib/sites/free-human-events.ts) until events carry a tag. The Year Wheel sits between them.
// Voice: the design's "Times are Pacific" is one house's zone, so the note names the keys instead; the closing line does not
// promise a letter on a schedule.
export const FREE_HUMAN_CALENDAR_HERO = {
  ground: 'day', edge: 'flow-bottom', texture: 'none', wander: true,
  eyebrow: 'Calendar · synced with Frequency',
  title: 'The year, *in circles.*',
  lead: 'The sky and our circle in one year. Turn the wheel to see the signs, moons and festivals with every gathering on them, then find each date below.',
  primaryLabel: 'See every date', primaryHref: '#month-by-month', feedLabel: 'Subscribe to calendar',
  nextEmpty: 'Dates to come', nextEmptyNote: 'Soon',
}

export const FREE_HUMAN_CALENDAR = {
  ground: 'gold', edge: 'flow', texture: 'earth', wander: true,
  eyebrow: 'Every date we gather',
  title: 'Month by month, *in the circle.*',
  defaultView: 'month', wheel: true,
  filters: ['all', 'circle', 'moon', 'turn', 'workshop', 'retreat', 'book'],
  collapseRecurring: true,
  empty: 'Nothing of that kind is open yet. The next letter has new dates first.',
  note: 'Use the arrow keys to move between months. Escape closes a panel.',
  buttonLabel: 'Reserve', subscribeLabel: 'Add the calendar feed',
  closingEyebrow: 'The turning',
  closingTitle: 'Mark the turns *with us.*',
  closingLead: 'A letter when there is something to say, with the dates ahead, and a calendar feed that keeps every circle, moon and turn of the year on your phone.',
  closingButton: 'Subscribe', closingDone: 'Thank you. You are on the list.',
}

// THE YEAR WHEEL (templates/website/YearWheel.dc.html). Turns by hand until a visitor scrolls on a wide screen; the Space's own
// gatherings sit on it. The heading is the design's, with the stars as the italic.
export const FREE_HUMAN_YEAR_WHEEL = {
  ground: 'day', edge: 'flat', texture: 'wind', wander: true,
  eyebrow: 'The year wheel · a guide to the sky',
  title: 'Twelve signs, eight festivals, *every moon.*',
  defaultMode: 'click', stepHeight: 32, stickOffset: 64,
  calendarHref: '#month-by-month',
}

export function freeHumanCalendarPage() {
  return {
    slug: 'calendar', label: 'Calendar',
    seo: { title: 'Calendar', description: 'Circles, moon gatherings, the turns of the year, workshops and retreats.' },
    blocks: [
      { type: 'FreeHumanCalendarHero', props: { ...FREE_HUMAN_CALENDAR_HERO } },
      { type: 'FreeHumanYearWheel', props: { ...FREE_HUMAN_YEAR_WHEEL } },
      { type: 'FreeHumanCalendar', props: { ...FREE_HUMAN_CALENDAR } },
    ] as FreeHumanBlockSeed[],
  }
}
