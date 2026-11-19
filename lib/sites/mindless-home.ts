// THE MINDLESS HOME, block by block (the Mindless design system's website, ui_kits/website, v13). Each constant is one block's
// default props in components/page-editor/blocks/mindless.tsx, in the design's voice. Owner rules for the copy: never literal
// about venues, no zig-zag, don't lean on punk. Template defaults coach the owner and invent nothing (owner 2026-11-18: "Make every
// Frequency theme FULLY generic with copy that coaches them what to write"): no place, price, date, count, host or quote of its own.

const PHOTO = (name: string) => `/sites/mindless/photos/${name}.jpg`

export const MINDLESS_HERO = {
  eyebrow: 'What you run · Where you meet',
  sticker: 'Say how to start',
  title: 'Say what you *help people do.*',
  lead: 'Say who this is for and what changes for them. Two plain sentences. Then one easy way to start.',
  primaryLabel: 'Find a circle',
  primaryHref: '~/booking',
  secondaryLabel: 'See the ways in',
  secondaryHref: '~/services',
  image: PHOTO('circle-yellow'),
  alt: 'People meditating in a circle',
  pos: '50% 50%',
}

export const MINDLESS_PAGE_HEAD = {
  eyebrow: 'Your program · How long it runs',
  title: 'Name the program. *Say what it changes.*',
  lead: 'Say how long it runs, how much time it asks each day and what it costs. One short paragraph.',
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
    { title: 'Your first belief.', body: 'One line on what you think is true about this work.' },
    { title: 'What you refuse to do.', body: 'One line on the thing other places do that you never will.' },
    { title: 'Who is in the room.', body: 'One line on the people who come.' },
    { title: 'Who holds the time.', body: 'One line on the people who lead.' },
  ],
  signoff: 'Your line here',
}

export const MINDLESS_PILLARS = {
  ground: '',
  num: '03',
  label: 'What we teach',
  title: 'Name what you teach. *Then where it goes.*',
  lead: 'Say where the practice starts and where people carry it after. One or two lines.',
  actionLabel: '',
  actionHref: '',
  rows: [
    { icon: 'wind', title: 'The first thing', body: 'Name the first technique you teach, in plain words.' },
    { icon: 'utensils', title: 'In real life', body: 'Say where it shows up after: at work, at home, on the drive.' },
    { icon: 'users', title: 'Together', body: 'Say how people practise with each other.' },
    { icon: 'orbit', title: 'Go deeper', body: 'Name the bigger idea behind it, plainly.' },
  ],
  drillsTitle: 'Try one now.',
  drillsLead: 'Give people one short practice they can do right now.',
  drills: [
    { label: 'Drill · 1 min', title: 'Name a short one', guide: '', length: '1:00', href: '~/services' },
    { label: 'Drill · 5 min', title: 'Name a longer one', guide: '', length: '5:00', href: '~/services' },
  ],
}

export const MINDLESS_WEEKS = {
  ground: '',
  num: '01',
  label: 'Week by week',
  title: 'One idea at a time. *Say the pace.*',
  lead: 'Say what each step teaches and what happens if someone misses one.',
  rows: [
    { title: 'Step one', body: 'What someone learns first.' },
    { title: 'Step two', body: 'What it builds on.' },
    { title: 'Step three', body: 'One line on it.' },
    { title: 'Step four', body: 'One line on it.' },
    { title: 'Step five', body: 'One line on it.' },
    { title: 'Step six', body: 'One line on it.' },
    { title: 'Step seven', body: 'One line on it.' },
    { title: 'Step eight', body: 'Where someone ends up.' },
  ],
}

export const MINDLESS_CIRCLES = {
  ground: '',
  num: '05',
  label: 'Start this week',
  title: 'Pull up a cushion. *This week.*',
  lead: 'Say how your groups meet and how someone joins one.',
  actionLabel: 'All circles',
  actionHref: '~/circles',
  rows: [
    { month: 'Date', day: '', host: 'Who hosts it', title: 'Name your first group', meta: 'Day and time · Where', spots: '', buttonLabel: 'Save a spot', href: '~/booking', tone: 'accent' },
    { month: 'Date', day: '', host: 'Who hosts it', title: 'Name the second', meta: 'Day and time · Where', spots: '', buttonLabel: 'Save a spot', href: '~/booking', tone: 'pink' },
    { month: 'Date', day: '', host: 'Who hosts it', title: 'Name the third', meta: 'Day and time · Where', spots: '', buttonLabel: 'Save a spot', href: '~/booking', tone: 'blue' },
    { month: 'Date', day: '', host: 'Who hosts it', title: 'Name one online', meta: 'Day and time · Online', spots: '', buttonLabel: 'Save a spot', href: '~/booking', tone: 'accent' },
  ],
  liveLabel: 'Can’t make it out?',
  liveTitle: 'Sit with us *live.*',
  liveLead: 'Say what you stream on Frequency and how someone joins from home.',
  live: [
    { day: 'Day', time: '', ampm: '', badge: 'Live', title: 'Name your live session', body: 'How long · on Frequency', buttonLabel: 'Set a reminder', href: '~/booking' },
    { day: 'Day', time: '', ampm: '', badge: 'Live', title: 'Name a second', body: 'How long · on Frequency', buttonLabel: 'Add to calendar', href: '~/booking' },
    { day: 'Day', time: '', ampm: '', badge: 'Live', title: 'Name a third', body: 'How long · on Frequency', buttonLabel: 'Add to calendar', href: '~/booking' },
  ],
}

export const MINDLESS_PEOPLE = {
  ground: '',
  num: '04',
  label: 'Real people',
  title: 'Same faces. *Every week.*',
  lead: 'Say who comes, plainly. The right people will recognise themselves.',
  photos: [
    { image: PHOTO('circle-pink'), alt: 'A circle on the cliffs at dawn', pos: '50% 60%' },
    { image: PHOTO('circle-mono'), alt: 'A circle with arms raised', pos: '50% 45%' },
    { image: PHOTO('beach-mono'), alt: 'People sitting on the beach at dawn', pos: '50% 50%' },
    { image: PHOTO('sunset-mono'), alt: 'A circle at dusk', pos: '50% 55%' },
  ],
  quotes: [
    { quote: 'Replace with a real quote from someone who came. Short and specific.', name: 'Their name', where: 'What they came to' },
    { quote: 'Replace with a real quote. Ask what changed for them.', name: 'Their name', where: 'What they came to' },
    { quote: 'Replace with a real quote. Their words, not yours.', name: 'Their name', where: 'What they came to' },
    { quote: 'Replace with a real quote. One sentence is plenty.', name: 'Their name', where: 'What they came to' },
  ],
}

export const MINDLESS_CARRY = {
  ground: 'pit',
  num: '08',
  label: 'It’s yours to carry',
  title: 'Lead one. *Say how you help.*',
  lead: 'If people can host or lead with you, say what you give them and how to start.',
  image: PHOTO('guide-mono'),
  alt: 'A guide sitting cross-legged, one hand on the chest, eyes closed',
  pos: '50% 25%',
  offers: [
    { title: 'Host one', body: 'Say what a host does and what you handle.', price: 'Your price', buttonLabel: 'Choose', href: '~/booking', tone: 'pink' },
    { title: 'Lead with us', body: 'Say how someone learns to lead.', price: 'Your price', buttonLabel: 'Choose', href: '~/booking', tone: 'blue' },
  ],
  guides: [
    { name: 'Their name', where: 'Role · Where', body: 'One line on who they are and why they lead.', image: '' },
    { name: 'Their name', where: 'Role · Where', body: 'One line on who they are and why they lead.', image: '' },
    { name: 'Their name', where: 'Role · Where', body: 'One line on who they are and why they lead.', image: '' },
  ],
}

export const MINDLESS_OFFERS = {
  ground: '',
  num: '09',
  label: 'Ways in',
  title: 'Pick a door. *Say what each costs.*',
  lead: '',
  actionLabel: '',
  actionHref: '',
  rows: [
    { title: 'Your first offer', body: 'What someone gets, in one line.', price: 'Your price', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'blue' },
    { title: 'Your main offer', body: 'The one most people start with.', price: 'Your price', badge: 'Start here', buttonLabel: 'Start', href: '~/booking', tone: '' },
    { title: 'A third offer', body: 'Who it suits, in one line.', price: 'Your price', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'pink' },
    { title: 'A membership', body: 'What it keeps going and what it opens.', price: 'Your price', badge: '', buttonLabel: 'Choose', href: '~/booking', tone: 'violet' },
  ],
  featured: 2,
  noteLabel: 'Real talk',
  note: 'Say plainly what this is and is not. If the work can stir things up, say what someone should do if it gets heavy.',
}

export const MINDLESS_FAQ = {
  ground: '',
  num: '11',
  label: 'Fair questions',
  title: 'Straight *answers.*',
  lead: 'Answer the questions people ask before they come. Short and straight.',
  rows: [
    { question: 'Do I need experience?', answer: 'Say who it suits on day one.' },
    { question: 'What does it cost?', answer: 'Say the price plainly, or how to find it.' },
    { question: 'What should I bring?', answer: 'Say what to bring, or that nothing is needed.' },
    { question: 'What is it not?', answer: 'Say plainly what this is not, and where to go if someone needs that instead.' },
  ],
}

export const MINDLESS_CTA = {
  ground: '',
  title: 'Say the last word.',
  em: 'Then one way in.',
  lead: 'One line that makes the first step feel easy.',
  primaryLabel: 'Find a circle',
  primaryHref: '~/booking',
  secondaryLabel: 'See the ways in',
  secondaryHref: '~/booking',
  image: PHOTO('dusk-mono'),
  alt: 'A circle at dusk',
  pos: '50% 55%',
}
