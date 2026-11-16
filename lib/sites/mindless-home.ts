// THE MINDLESS HOME, block by block (the Mindless design system's website, ui_kits/website, v13). Each constant is one block's
// default props in components/page-editor/blocks/mindless.tsx, in the design's own words. Owner rules for the copy: never literal
// about venues, no zig-zag, don't lean on punk. Sample people and quotes stay sample: a live site writes its own.

const PHOTO = (name: string) => `/sites/mindless/photos/${name}.jpg`

export const MINDLESS_HERO = {
  eyebrow: 'Meditation circles · In person and online',
  sticker: 'First sit’s on us',
  title: 'Unwind *your mind.*',
  lead: 'Your head won’t shut up. Good. That’s where it starts. A few people, twenty quiet minutes, and something you carry back into the rest of your day.',
  primaryLabel: 'Find a circle',
  primaryHref: '~/circles',
  secondaryLabel: 'Start the program',
  secondaryHref: '~/services',
  image: PHOTO('hero-yellow'),
  alt: 'A circle of people with arms raised',
  pos: '55% 40%',
}

export const MINDLESS_PAGE_HEAD = {
  eyebrow: 'The Mindless Program · 8 weeks',
  title: 'Learn to sit. *Then take it everywhere.*',
  lead: 'Eight weeks. A few minutes a day. The kind of practice that shows up when you need it. Pay what fits.',
  primaryLabel: 'Start week one',
  primaryHref: '~/booking',
  secondaryLabel: '',
  secondaryHref: '',
  image: PHOTO('guide-mono'),
  alt: 'A guide sitting cross-legged, eyes closed',
  pos: '50% 25%',
  drip: true,
}

export const MINDLESS_SPLIT = {
  ground: 'pit',
  num: '02',
  label: 'The quiet part',
  title: 'A calm mind is *countercultural.*',
  lead: 'Everything around you wants your attention. Keeping some for yourself is a small rebellion. Nobody can do it for you.',
  image: PHOTO('firepit-mono'),
  alt: 'Three people sitting around a firepit, eyes closed',
  pos: '55% 50%',
  rows: [
    { title: 'Your attention is yours.', body: 'Take it back a minute at a time.' },
    { title: 'Nobody to follow.', body: 'No guru. No app. No retreat.' },
    { title: 'Alone, together.', body: 'Your practice, other people in the room.' },
    { title: 'No idols.', body: 'Guides hold the time. That’s all.' },
  ],
  signoff: 'Unwind your mind',
}

export const MINDLESS_PILLARS = {
  ground: '',
  num: '03',
  label: 'What we teach',
  title: 'Sit down. *Then take it with you.*',
  lead: 'It starts on a cushion. It ends up at the sink, in traffic, in the middle of a hard conversation.',
  actionLabel: '',
  actionHref: '',
  rows: [
    { icon: 'wind', title: 'Sit', body: 'The old techniques, minus the mystique. Breath, body, noticing.' },
    { icon: 'utensils', title: 'Chop wood, carry water', body: 'The dishes count. So does the drive. Practice goes where you go.' },
    { icon: 'users', title: 'Circles', body: 'A few people, same time every week. That’s the whole secret.' },
    { icon: 'orbit', title: 'Go deep', body: 'Impermanence, no-self, flow. Big ideas, plain words.' },
  ],
  drillsTitle: 'Try one now.',
  drillsLead: 'Sixty seconds. Eyes open. Right where you are.',
  drills: [
    { label: 'Drill · 1 min', title: 'One-minute breath', guide: '', length: '1:00', href: '~/services' },
    { label: 'Drill · 5 min', title: 'The dish sit', guide: '', length: '5:00', href: '~/services' },
  ],
}

export const MINDLESS_WEEKS = {
  ground: '',
  num: '01',
  label: 'The eight weeks',
  title: 'One idea a week. *A few minutes a day.*',
  lead: 'A short sit, a small practice for real life, and people to share it with. Miss a day. Nothing breaks.',
  rows: [
    { title: 'Sit down. Breathe.', body: 'Find a seat. Find your breath. That’s week one.' },
    { title: 'The body is the anchor', body: 'When the head runs off, the body stays put.' },
    { title: 'Name the noise', body: 'Call it what it is. Watch it loosen.' },
    { title: 'Practice in motion', body: 'Walking, cooking, washing up.' },
    { title: 'Practice in people', body: 'Traffic, meetings, family dinner.' },
    { title: 'Hard feelings, held', body: 'The heavy stuff, with a plan for too much.' },
    { title: 'Open awareness', body: 'Stop steering. Notice everything.' },
    { title: 'Trust and flow', body: 'Let it run in the background of a normal day.' },
  ],
}

export const MINDLESS_CIRCLES = {
  ground: '',
  num: '05',
  label: 'Start this week',
  title: 'Pull up a cushion. *This week.*',
  lead: 'Small groups, same time every week. Pick one. Come once. See what happens.',
  actionLabel: 'All circles',
  actionHref: '~/circles',
  rows: [
    { month: 'Dec', day: '4', host: 'Hosted by Maya R.', title: 'Thursday night circle', meta: 'Thu 7:00pm · Downtown', spots: '12 spots left', buttonLabel: 'Save a spot', href: '~/booking', tone: 'accent' },
    { month: 'Dec', day: '6', host: 'Hosted by Dev K.', title: 'Saturday morning circle', meta: 'Sat 9:00am · North Park', spots: '6 spots left', buttonLabel: 'Save a spot', href: '~/booking', tone: 'pink' },
  ],
  liveLabel: 'Can’t make it out?',
  liveTitle: 'Sit with us *live.*',
  liveLead: 'Weekly on Frequency. Cameras optional. Interruptions welcome.',
  live: [
    { day: 'Sun', time: '8', ampm: 'am', badge: 'Live Sunday', title: 'Sunday sit, live', body: 'Weekly stream · 30 min · on Frequency', buttonLabel: 'Set a reminder', href: '~/booking' },
    { day: 'Wed', time: '6', ampm: 'pm', badge: '45 min', title: 'Ask a guide', body: 'Live Q&A · 45 min · on Frequency', buttonLabel: 'Add to calendar', href: '~/booking' },
  ],
}

export const MINDLESS_PEOPLE = {
  ground: '',
  num: '04',
  label: 'Real people',
  title: 'Same faces. *Every week.*',
  lead: 'Nobody here has it figured out. That’s why it works.',
  photos: [
    { image: PHOTO('rooftop-mono'), alt: 'A circle seen from above', pos: '50% 55%' },
    { image: PHOTO('circle-mono'), alt: 'A circle with arms raised', pos: '50% 45%' },
    { image: PHOTO('beach-mono'), alt: 'People sitting on the beach at dawn', pos: '50% 50%' },
    { image: PHOTO('sunset-mono'), alt: 'A circle at dusk', pos: '50% 55%' },
  ],
  quotes: [],
}

export const MINDLESS_CARRY = {
  ground: 'pit',
  num: '08',
  label: 'It’s yours to carry',
  title: 'Start a circle. *We’ll back you.*',
  lead: 'Every circle starts with one person who keeps showing up. If that’s you, we’ll give you what you need and help people find you.',
  image: PHOTO('guide-yellow'),
  alt: 'A guide sitting cross-legged, one hand on the chest, eyes closed',
  pos: '50% 25%',
  offers: [
    { title: 'Host a circle', body: 'Pick a time. Invite a few people. We’ll handle the rest.', price: 'Free', buttonLabel: 'Choose', href: '~/booking', tone: 'pink' },
    { title: 'Become a guide', body: 'Learn to hold the room. Then hold it.', price: 'Free training', buttonLabel: 'Choose', href: '~/booking', tone: 'blue' },
  ],
  guides: [],
}

export const MINDLESS_OFFERS = {
  ground: '',
  num: '09',
  label: 'Ways in',
  title: 'Pick a door. *Most are free.*',
  lead: '',
  actionLabel: '',
  actionHref: '',
  rows: [
    { title: 'A circle', body: 'Same people, same time, every week.', price: 'Free', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'blue' },
    { title: 'The program', body: 'Eight weeks. Short sits. Small habits that stick.', price: '$0–$49', badge: 'Start here', buttonLabel: 'Start', href: '~/booking', tone: '' },
    { title: 'Become a guide', body: 'Hold the time for others. We’ll show you how.', price: 'Free training', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'pink' },
    { title: 'Supporter', body: 'Keeps circles free. Opens the full library.', price: '$9 / month', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'violet' },
  ],
  featured: 2,
  noteLabel: 'Real talk',
  note: 'Mindless is education, not therapy. Meditation can stir things up. If it gets heavy, stop, open your eyes, and talk to someone.',
}

export const MINDLESS_FAQ = {
  ground: '',
  num: '11',
  label: 'Fair questions',
  title: 'Straight *answers.*',
  lead: 'Still unsure? Come once. Leave early if you want. Nobody will make it weird.',
  rows: [
    { question: 'Do I need experience?', answer: 'No. Most people in a circle are on their first or second sit.' },
    { question: 'Is it religious?', answer: 'No. The techniques are old. Believing in them is optional.' },
    { question: 'What if I can’t sit still?', answer: 'Good. Neither can we. Fidgeting is part of it.' },
    { question: 'Is this therapy?', answer: 'No. Mindless is education, not treatment. If it gets heavy, stop and talk to a professional.' },
  ],
}

export const MINDLESS_CTA = {
  ground: '',
  title: 'Here’s one breath.',
  em: 'Now come sit with us.',
  lead: 'A few people. Twenty minutes. Every week.',
  primaryLabel: 'Find a circle',
  primaryHref: '~/circles',
  secondaryLabel: 'Start one',
  secondaryHref: '~/booking',
  image: PHOTO('rooftop-mono'),
  alt: 'A circle seen from above',
}
