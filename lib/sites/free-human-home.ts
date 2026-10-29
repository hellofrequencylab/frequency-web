import { freeHumanPhotoSrc } from '@/lib/sites/free-human-photos'

// THE FREE HUMAN HOME, AS THE DESIGN SETS IT (Free Human Movement design system, templates/website/Website.dc.html). PURE: no
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
// VOICE (docs/marketing/voice-and-language-guide.md wins over the design's words). The design's sample house carries real dates
// and a standing weekday; a seed never promises either, so each is softened or left out. Changes, each noted on the ledger row
// LIVE-1910:
//   - Hero badge, "Autumn circle opens Nov 5" -> "A new circle opens each season" (a date nobody scheduled).
//   - Seasons lead, "a live circle every Thursday" and the badge "Live circle Thursdays" -> "a live circle" and "A live circle each
//     season" (a standing weekday is a weekly promise).
//   - Workshop and event sample rows carry no dates: a row with no date shows its glyph where the date would sit.
//   - Speaking, "We reply within a week." -> "We write back to every request." (no turnaround promise).
//   - Kept as the design wrote them: the lyric band line (a line, not a claim), the workshop note "Small groups, long pauses."
//     (it describes the format) and the books' own descriptions.

interface FreeHumanBlockSeed { type: string; props: Record<string, unknown> }

/** The served path of a select. */
const ph = freeHumanPhotoSrc

export const FREE_HUMAN_HERO = {
  ground: 'day', edge: 'flow-bottom', texture: 'none', wander: true,
  badge: 'A new circle opens each season',
  title: 'Move like the woman who *made a world.*',
  lead: 'A year-round embodiment practice for women who are creating life, birthing it, and raising it. Old wisdom, practiced in a modern body.',
  primaryLabel: 'Join the circle', primaryHref: '~/program', primaryStyle: 'madder',
  secondaryLabel: 'See the year', secondaryHref: '~/program',
  image: ph('heritage-a-virgin'), alt: 'Painting of a woman in golden robes walking forward with two children', pos: 'center 20%',
  eggImage: ph('light-honey-dipper'), sunImage: ph('light-sun'), pebbleImage: ph('place-daisies'),
  rays: true,
}

export const FREE_HUMAN_SEASONS = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: true,
  eyebrow: 'The year-round program',
  title: 'A practice for *every season* of motherhood.',
  lead: 'Join in any month. Each season brings a new module of movement, teaching and ritual, held together by a live circle.',
  seasons: [
    { season: 'winter', name: 'Rest', glyph: 'moon', texture: 'water', body: 'Yoga nidra, slow mornings and the art of doing less.', image: ph('light-floating-candles'), alt: 'Candles floating on dark water', pos: 'center', href: '~/program' },
    { season: 'spring', name: 'Embody', glyph: 'seedling', texture: 'plant', body: 'Floor work that brings you back into pelvis, breath and spine.', image: ph('place-daisies'), alt: 'Daisies in a green meadow', pos: 'center', href: '~/program' },
    { season: 'summer', name: 'Create', glyph: 'sun', texture: 'fire', body: 'Conception, pregnancy and birth, held as sacred work.', image: ph('place-fruit-branch'), alt: 'Ripening fruit on a branch', pos: 'center', href: '~/program' },
    { season: 'fall', name: 'Raise', glyph: 'olive', texture: 'earth', body: 'Rhythm, play and the village you were promised.', image: ph('heritage-madonna-nursing'), alt: 'Painting of a mother holding her newborn by candlelight', pos: 'center', href: '~/program' },
  ],
  buttonLabel: 'Join the year', buttonHref: '~/program',
  badges: ['Join in any month', 'A live circle each season'],
}

export const FREE_HUMAN_LYRIC = {
  ground: 'gold', edge: 'flow', texture: 'none', wander: true,
  line: 'Softness is not the opposite of strength. It is how strength moves.',
  feelings: [
    { glyph: 'love', label: 'Love' }, { glyph: 'joy', label: 'Joy' }, { glyph: 'grief', label: 'Grief' }, { glyph: 'anger', label: 'Anger' },
    { glyph: 'fear', label: 'Fear' }, { glyph: 'tender', label: 'Tenderness' }, { glyph: 'longing', label: 'Longing' }, { glyph: 'wonder', label: 'Wonder' },
  ],
  note: 'All of it is welcome in the circle.',
}

export const FREE_HUMAN_WORKSHOPS = {
  ground: 'paper', edge: 'flat', texture: 'earth', wander: false,
  eyebrow: 'Workshops',
  title: 'Go deeper, *in a single afternoon.*',
  aside: 'Open to everyone, members or not. Small groups, long pauses.',
  tag: 'workshop', count: 3,
  rows: [
    { when: 'Date to come', mode: 'Online', title: 'Breath *for birth*', body: 'Three hours of breath and sound for the last trimester. Partners welcome.', image: ph('light-honey-spoon'), pos: 'center 60%', shape: 'egg', href: '~/workshops' },
    { when: 'Date to come', mode: 'In person', title: 'Mother anger, *held*', body: 'What rage is asking for, and how to move it through the body with care.', image: ph('heritage-magdalene'), pos: 'center 25%', shape: 'arch', href: '~/workshops' },
    { when: 'Date to come', mode: 'Family', title: 'Floor play *with littles*', body: 'Bring your children. We move, build and rest together on the floor.', image: ph('craft-yarn-bodies'), pos: 'center', shape: 'circle', href: '~/workshops' },
  ],
  buttonLabel: 'Reserve',
}

export const FREE_HUMAN_EVENTS = {
  ground: 'night', edge: 'flow', texture: 'fire', wander: true,
  eyebrow: 'Gatherings & events',
  title: 'Come as you are. *Bring the baby.*',
  image: ph('light-lanterns'), alt: 'Many paper lanterns rising into the night sky', pos: 'center',
  count: 4,
  empty: 'No dates are open right now. The next letter has them first.',
  rows: [
    { glyph: 'gathering', title: 'Autumn circle opens', meta: 'Online · Members', href: '~/calendar', featured: true },
    { glyph: 'full-moon', title: 'Full moon gathering', meta: 'In person · Song, fire, a shared meal', href: '~/calendar' },
    { glyph: 'sun-sign', title: 'Solstice retreat', meta: 'Three days · In person · Childcare held', href: '~/calendar' },
    { glyph: 'half-moon', title: 'Winter rest begins', meta: 'Online · New season module', href: '~/calendar' },
  ],
  buttonLabel: 'Reserve', calendarLabel: 'See the whole year on the calendar', calendarHref: '~/calendar',
}

export const FREE_HUMAN_BOOKS = {
  ground: 'sunset', edge: 'flow', texture: 'wind', wander: true,
  eyebrow: 'Books by Audrey Uma Wilder',
  title: 'Words for the *wild work.*',
  books: [
    { title: 'Beyond *The Wild*', subtitle: 'A guide to rearing children.', body: 'On raising children with rhythm, freedom and old wisdom, and on the mother who grows alongside them.', status: 'New', cover: 'jade', image: ph('craft-beaded-deer'), pos: 'center 60%', rays: false, primaryLabel: 'Order now', primaryHref: '~/shop', secondaryLabel: 'Read an excerpt', secondaryHref: '~/books' },
    { title: 'Defying *Men*', subtitle: 'How to move through the modern world.', body: 'For women who are done shrinking. A field guide to living in a body that is fully your own.', status: 'Pre-order', cover: 'oxblood', image: ph('heritage-maiden-sword'), pos: 'center 15%', rays: true, primaryStyle: 'gilt', primaryLabel: 'Pre-order', primaryHref: '~/shop', secondaryLabel: 'Read an excerpt', secondaryHref: '~/books' },
  ],
}

export const FREE_HUMAN_SPEAKING = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: false,
  eyebrow: 'Your guide · Speaking',
  title: 'Audrey Uma *Wilder*',
  body: 'Audrey created Free Human Movement for women in their season of creation: conceiving, carrying, birthing and raising. She speaks on embodiment, motherhood and feminine power at conferences, retreats, schools and on podcasts.',
  image: ph('founder-audrey'), alt: 'Audrey Uma Wilder laughing in a garden, holding purple flowers', pos: 'center 22%',
  accentImage: ph('myth-guanyin'), accentPos: 'center 30%',
  topics: [{ glyph: 'bloom', label: 'Embodied motherhood' }, { glyph: 'seedling', label: 'Rearing children wild' }, { glyph: 'sparkle', label: 'Women and power' }, { glyph: 'moon', label: 'Ritual in daily life' }],
  formTitle: 'Bring Audrey *to your gathering.*',
  kinds: ['Conference or summit', 'Retreat', 'School or parent group', 'Podcast or interview', 'Something else'],
  buttonLabel: 'Request a booking',
  note: 'We write back to every request.',
  successMessage: 'Thank you. Your request is with Audrey.',
}

export const FREE_HUMAN_LINEAGE = {
  ground: 'paper', edge: 'flat', texture: 'none', wander: false,
  eyebrow: 'Lineage',
  title: 'The women *before us.*',
  aside: 'Maiden, mother, Magdalene, goddess. We practice in good company.',
  photos: [
    { image: ph('heritage-mosaic-magdalena'), alt: 'Mosaic of Mary Magdalene', pos: 'center 30%' },
    { image: ph('heritage-carved-madonna'), alt: 'Carved wooden Madonna', pos: 'center 20%' },
    { image: ph('myth-bronze-tara'), alt: 'Bronze statue of Tara', pos: 'center 30%' },
    { image: ph('myth-antler-moon'), alt: 'Antlered woman before a full moon', pos: 'center 40%' },
    { image: ph('myth-golden-egg'), alt: 'Woman in a red veil holding a glowing golden egg', pos: 'center 45%' },
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
