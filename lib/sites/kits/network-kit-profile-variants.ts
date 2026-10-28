import { networkKitProfileName, networkKitSpotlightContent } from '@/lib/spotlight/network-kit-content'
import {
  NETWORK_KIT_CTA, NETWORK_KIT_FAQ, NETWORK_KIT_GATHERINGS, NETWORK_KIT_HERO, NETWORK_KIT_JOURNEYS, NETWORK_KIT_LETTER, NETWORK_KIT_LIBRARY, NETWORK_KIT_LIVE,
  NETWORK_KIT_MEMBERSHIP, NETWORK_KIT_OFFERINGS, NETWORK_KIT_PROOF, NETWORK_KIT_SHOP, NETWORK_KIT_STEPS, withBands,
} from '@/lib/sites/network-kit-home'
import {
  NETWORK_KIT_CALENDAR, NETWORK_KIT_CHAPTERS, NETWORK_KIT_CIRCLES, NETWORK_KIT_CONTACT, NETWORK_KIT_FEATURED, NETWORK_KIT_MERCH, NETWORK_KIT_NOTE, NETWORK_KIT_PILLARS,
  NETWORK_KIT_PODCAST, NETWORK_KIT_ROOMS, NETWORK_KIT_SOCIAL, NETWORK_KIT_STATS, NETWORK_KIT_VENUE,
} from '@/lib/sites/network-kit-extras'
import type { KitNiche, KitPage, SiteKit } from './types'

// Network Theme Kit x the thirteen profile starter kits of the design system (ui_kits/site/kits.js). One kit per
// profile, `network-kit-<niche>`: the profile id IS the kit's niche (general, coaches, studios ... markets), so a new
// Space that picked the Network look and a niche starts on its own kit, and `network-kit-general` is the General kit
// the starter site publishes. Each kit is a home assembled from the Network blocks (components/page-editor/blocks/
// network-kit.tsx and network-kit-more.tsx) in the design's own order, with the layout variants the design's kit names
// per block, plus one short page for each tool the profile has on, so every button on the home has somewhere to go.
// Those pages are plain starters (a header and the matching block); the full inner pages are a later pass.
//
// The hero, the ways in, the heads and the letter come from lib/spotlight/network-kit-content.ts, which already holds
// the thirteen profiles' names and rules in the voice guide's words. The steps, questions, tiers and offers below are
// the design's, fixed to the voice guide: no number about a real group (members, seats, ratings, years, prices), no
// day or rhythm ("every Friday", "every other Tuesday", "first Thursday of every month"), no "free" promise, no
// "cohort", no placeholder prompt left for the owner ("Add your parking details here"). Prices stay empty: a block draws
// no price line without one. Wrap words in *stars* for the italic.

type Tool = 'gather' | 'belong' | 'book' | 'learn' | 'sell' | 'publish'
type Block = { type: string; props: Record<string, unknown> }
type Pair = [string, string]
type Layouts = Partial<Record<'steps' | 'doors' | 'offerings' | 'journeys' | 'gatherings' | 'membership' | 'proof' | 'shop' | 'library' | 'letter' | 'faq' | 'cta', string>>

interface Heads { eyebrow?: string; title: string; em: string; kicker?: string }
interface ProfileRow {
  /** The design's description of who the kit is for, in the voice guide's words. */
  who: string
  /** The design's home blocks, in order. `cta` closes every kit. */
  blocks: string[]
  hero: 'split' | 'full' | 'center' | 'left'
  flip?: boolean
  layouts: Layouts
  /** Where the main button and the second hero button go (a route of the design's nav). */
  route: string
  cta2: { label: string; route: string }
  steps: { eyebrow: string; title: string; em: string; items: [Pair, Pair, Pair] }
  /** Section heads the design's kit rewrites; a block with none uses the base block's own. */
  heads: Partial<Record<'doors' | 'journeys' | 'membership' | 'shop' | 'library' | 'gatherings' | 'offerings' | 'faq' | 'cta', Heads>>
  faqs?: Pair[]
  tiers?: [Pair, Pair, Pair]
  offers?: [Pair, Pair, Pair]
  products?: string[]
  resources?: [string, string][]
  letterBody?: string
  /** A letter head to use instead of the Spotlight one, where that one makes a promise. */
  letter?: Pair
  /** Tools the design's kit has on that the Spotlight rules do not list (the General kit sells). */
  more?: Tool[]
}

const ROW: Record<string, ProfileRow> = {
  general: {
    who: 'A local group that meets, with a way to show up the first time.',
    blocks: ['hero', 'stats', 'venue', 'featured', 'calendar', 'steps', 'chapters', 'circles', 'note', 'pillars', 'membership', 'rooms', 'podcast', 'social', 'merch', 'contact'],
    hero: 'split', more: ['sell'], layouts: { steps: 'grid', gatherings: 'split', doors: 'grid', proof: 'stats', faq: 'split', letter: 'band', cta: 'center' }, route: 'workshops', cta2: { label: 'How it works', route: 'about' },
    steps: { eyebrow: 'How it works', title: 'Three easy', em: 'ways in', items: [['Come once', 'Arrive a few minutes early and say you are new.'], ['Meet a few people', 'We seat you at a small table and a host makes the first introductions.'], ['Keep showing up', 'Join when it feels right. The room feels smaller each time you come.']] },
    heads: { gatherings: { title: 'When we', em: 'meet', kicker: 'The morning meetup, the evening mixer and the odd special. All in one place.' }, membership: { eyebrow: 'Membership', title: 'Show up,', em: 'together', kicker: 'Come and see first. Join to keep your seat, the directory and the member nights.' }, faq: { title: 'Good to', em: 'know' } },
    faqs: [['Do I need to be a member to come?', 'No. Come to a meetup first. Join when you know it is your group.'], ['What happens at a meetup?', 'Coffee, a short welcome, then small tables. A host introduces you around, and one member shares what they are working on.'], ['Is it a sales pitch room?', 'No. Nobody pitches at the table. People help when they can, and business follows.']],
    tiers: [['Community', 'Come to meetups and get the newsletter.'], ['Member', 'Your seat at the table, the directory and member nights.'], ['Business partner', 'Sponsor a morning, host a table and appear in the partner list.']],
  },
  coaches: {
    who: 'Mentor-led circles and one-to-one sessions that pair experienced members with people a few steps behind.',
    blocks: ['hero', 'steps', 'offerings', 'proof', 'gatherings', 'faq', 'letter', 'cta'],
    hero: 'split', layouts: { steps: 'timeline', offerings: 'split', gatherings: 'split', proof: 'quote', faq: 'stack', letter: 'card', cta: 'split' }, route: 'book', cta2: { label: 'See the circles', route: 'services' },
    steps: { eyebrow: 'How it works', title: 'From hello to', em: 'matched', items: [['Tell us where you are', 'A short call about your work, your goals and the help you want.'], ['Meet your mentor', 'We suggest two people. You pick the one who fits.'], ['Meet together', 'Meet for a season, with a circle of peers in between.']] },
    heads: { offerings: { title: 'Ways to', em: 'be mentored', kicker: 'Start with a call. Many people join a circle first.' }, gatherings: { eyebrow: 'Circles', title: 'Small circles,', em: 'one table', kicker: 'Circles meet in person or on video.' }, faq: { title: 'Before you', em: 'start' }, cta: { title: 'Not sure where to start?', em: 'Say hello first.' } },
    faqs: [['Who are the mentors?', 'Members who volunteer some of their time. Each one has run a business or led a team.'], ['Can I change mentors?', 'Yes. Tell us after any session and we will suggest someone new.']],
    letter: ['Start with a call.', 'Then see.'],
    offers: [['Intro call', 'A short call so we can understand what you need and suggest a match.'], ['One-to-one session', 'Time with your mentor. You bring the question, you leave with next steps.'], ['Circle season', 'A season with a few peers and a mentor, meeting together.']],
  },
  studios: {
    who: 'Shared workspaces where the community matters as much as the desk: passes, member events and who is in this week.',
    blocks: ['hero', 'live', 'gatherings', 'steps', 'membership', 'proof', 'faq', 'cta'],
    hero: 'full', layouts: { gatherings: 'calendar', steps: 'strip', membership: 'table', proof: 'wall', faq: 'split', cta: 'center' }, route: 'book', cta2: { label: 'See membership', route: 'membership' },
    steps: { eyebrow: 'Your first day', title: 'Easy', em: 'to start', items: [['Book a day pass', 'Pick a day that suits you.'], ['Meet the regulars', 'Coffee in the morning, lunch at the long table, a hello from the host.'], ['Make it yours', 'Join for a desk that is always there. Pause when you need to.']] },
    heads: { gatherings: { eyebrow: 'This month', title: 'Member', em: 'events', kicker: 'Lunch and learns, drinks and skill swaps.' }, membership: { title: 'Come as often', em: 'as you like', kicker: 'Three ways in. Every one includes the member events.' }, faq: { title: 'First visit?', em: 'Read this.' }, cta: { title: 'Come for a day', em: 'and see.' } },
    faqs: [['Is there parking?', 'Parking, transit and bike storage details are on the contact page.'], ['Can I bring a guest?', 'Members can bring a guest. Ask at the desk.']],
    offers: [['Day pass', 'Pick a day and use any open desk.'], ['Meeting room', 'A room for your team or a client.'], ['Guest pass', 'Bring someone along to see the space.']],
    tiers: [['Flex', 'Come on the days you need, any desk.'], ['Resident', 'Your own desk, every day, plus meeting room hours.'], ['Team', 'Desks for a team, a team room and member events for all.']],
  },
  hosts: {
    who: 'Evening mixers and social nights for professionals: what is on, who comes, and a list to hear about the next one.',
    blocks: ['hero', 'gatherings', 'steps', 'proof', 'letter', 'faq', 'cta'],
    hero: 'center', layouts: { gatherings: 'cards', steps: 'strip', proof: 'wall', letter: 'band', faq: 'stack', cta: 'band' }, route: 'workshops', cta2: { label: 'Our story', route: 'about' },
    steps: { eyebrow: 'Join in', title: 'Come', em: 'along', items: [['Grab a ticket', 'Pick a mixer and get your ticket.'], ['Get introduced', 'Hosts walk the room and connect people on purpose.'], ['Follow up', 'Say hello to the people you met, while it is fresh.']] },
    heads: { gatherings: { eyebrow: 'Coming up', title: 'Next', em: 'mixers', kicker: 'New dates show up here first.' }, faq: { title: 'Good to', em: 'know' }, cta: { title: 'Bring a friend.', em: 'Leave with new ones.' } },
    faqs: [['Do I need to know anyone?', 'No. Most people come alone. Hosts make sure nobody stands at the edge.'], ['What should I wear?', 'Whatever you wore to work. Each invitation says if a venue has a dress code.']],
    letterBody: 'Date, venue and who is hosting.',
  },
  venues: {
    who: "A members' clubhouse or community hub: the space, the calendar, and how to host your own event there.",
    blocks: ['hero', 'live', 'offerings', 'steps', 'gatherings', 'faq', 'cta'],
    hero: 'split', flip: true, layouts: { offerings: 'cards', steps: 'timeline', gatherings: 'calendar', faq: 'split', cta: 'split' }, route: 'contact', cta2: { label: 'See the calendar', route: 'workshops' },
    steps: { eyebrow: 'Ways to use the space', title: 'Tell us what you', em: 'have in mind', items: [['Come and visit', 'Drop in during open hours and meet the team.'], ['Host a meetup', 'Breakfasts, panels, socials and workshops.'], ['Book a regular slot', 'A steady morning or evening for your chapter or circle.']] },
    heads: { offerings: { eyebrow: 'Host here', title: 'Rooms for', em: 'every gathering', kicker: 'Member groups get first pick of dates.' }, gatherings: { eyebrow: 'Calendar', title: 'Coming', em: 'up', kicker: 'Every event in the space, member-run and ours.' }, faq: { title: 'Before you', em: 'visit' }, cta: { title: 'Come and', em: 'see it.' } },
    faqs: [['How do I find you?', 'The address and notes on parking and access are on the contact page.'], ['Can my group book the space?', 'Yes. Send the date, how many people and what you are planning.']],
    offers: [['Visit', 'Drop in during open hours, look around and meet the team.'], ['Host a meetup', 'A room, chairs, coffee and a host on hand.'], ['Regular slot', 'The same morning or evening for your group.']],
  },
  nonprofits: {
    who: 'Coalitions and civic groups that bring organizations together: the work, the meetings and how to take part.',
    blocks: ['hero', 'doors', 'steps', 'gatherings', 'proof', 'membership', 'letter', 'cta'],
    hero: 'left', layouts: { doors: 'list', steps: 'strip', gatherings: 'calendar', proof: 'stats', membership: 'spotlight', letter: 'card', cta: 'center' }, route: 'contact', cta2: { label: 'See what is coming up', route: 'workshops' },
    steps: { eyebrow: 'Ways to help', title: 'Small or big,', em: 'it all counts', items: [['Come to a meeting', 'Open to everyone. Say hello at the door.'], ['Volunteer', 'Give a morning when you can.'], ['Partner', 'Bring your organization to the table.']] },
    heads: { doors: { eyebrow: 'Ways to help', title: 'Pick', em: 'your way in' }, gatherings: { eyebrow: 'Coming up', title: 'Meet', em: 'with us', kicker: 'Open meetings, volunteer days and working groups.' }, membership: { eyebrow: 'Partner', title: 'Keep the work', em: 'going', kicker: 'Partner organizations fund the shared work. Every level says what it pays for.' }, cta: { title: 'Start with', em: 'one meeting.' } },
    tiers: [['Friend', 'Get updates and come to open meetings.'], ['Partner organization', 'A seat at the table and a listing in the directory.'], ['Founding partner', "Shape the year's priorities and host a meeting."]],
    letterBody: 'What we did, what is next and where we need hands.',
  },
  networks: {
    who: 'Many chapters under one name: find a chapter, start one, and see what is happening everywhere.',
    blocks: ['hero', 'doors', 'gatherings', 'proof', 'membership', 'steps', 'faq', 'cta'],
    hero: 'full', layouts: { doors: 'tiles', gatherings: 'calendar', membership: 'table', steps: 'strip', faq: 'stack', cta: 'band' }, route: 'workshops', cta2: { label: 'Start one', route: 'contact' },
    steps: { eyebrow: 'Find your people', title: 'Three', em: 'ways in', items: [['Find a chapter', 'See who meets near you and when.'], ['Come to a meetup', 'Visit any chapter and say you are new.'], ['Start a chapter', 'We train hosts and help you fill the first table.']] },
    heads: { doors: { eyebrow: 'Ways in', title: 'Find your', em: 'chapter' }, gatherings: { eyebrow: 'Every chapter', title: 'Across the', em: 'network', kicker: 'Meetups from every chapter show up here.' }, membership: { title: 'One membership,', em: 'every chapter', kicker: 'Join once and you are welcome at any chapter.' }, faq: { title: 'Good', em: 'to know' }, cta: { title: 'No chapter near you?', em: 'Start one.' } },
    faqs: [['How do I start a chapter?', 'Write to us. We will talk about your town, your people and the day that works. Hosts get training, templates and a mentor host.'], ['Can I visit other chapters?', 'Yes. Members are welcome at every chapter.']],
    tiers: [['Member', 'Any chapter, plus the directory.'], ['Supporter', 'Everything in Member, and you help fund new chapters.'], ['Chapter host', 'Run a chapter with training, tools and other hosts behind you.']],
  },
  creators: {
    who: "Collectives of artists, makers and freelancers: the members' work, the shows and studio nights, and a way to join.",
    blocks: ['hero', 'gatherings', 'shop', 'steps', 'membership', 'proof', 'letter', 'cta'],
    hero: 'split', layouts: { shop: 'rail', gatherings: 'cards', steps: 'timeline', membership: 'spotlight', proof: 'quote', letter: 'card', cta: 'split' }, route: 'membership', cta2: { label: "See members' work", route: 'shop' },
    steps: { eyebrow: 'How to join', title: 'Three steps', em: 'in', items: [['Come to an open night', 'Bring something you are working on.'], ['Meet the members', 'Someone will show you around and introduce you.'], ['Join', 'Your work in the shop, your name in the referral list.']] },
    heads: { shop: { eyebrow: "Members' work", title: 'Made by', em: 'the collective' }, gatherings: { eyebrow: 'Studio nights', title: 'Come to', em: 'an open night', kicker: 'Crits, show and tell, and a long table of people who get it.' }, membership: { eyebrow: 'Membership', title: 'Grow', em: 'together', kicker: 'Members share referrals, studio time and a place in the shop.' }, cta: { title: 'Bring your work.', em: 'Meet your people.' } },
    tiers: [['Friend', 'Come to open nights and see the work.'], ['Member', 'Your work in the shop, studio time and the referral list.'], ['Studio', 'For studios that want to host a night and be listed.']],
    products: ['A member print', 'A studio zine', 'A ceramic piece', 'An open night pass'],
    letterBody: 'New work, open calls and the next studio night.',
  },
  schools: {
    who: 'Programs, accelerators and host training: what you teach, when the next group starts and how to apply.',
    blocks: ['hero', 'live', 'journeys', 'steps', 'gatherings', 'proof', 'faq', 'cta'],
    hero: 'split', layouts: { journeys: 'feature', steps: 'timeline', gatherings: 'calendar', proof: 'stats', faq: 'split', cta: 'center' }, route: 'journeys', cta2: { label: 'Ask a question', route: 'contact' },
    steps: { eyebrow: 'How it works', title: 'From curious', em: 'to the group', items: [['Pick a program', 'See what it covers, how long it runs and who it is for.'], ['Apply', 'A short form and a call.'], ['Start together', 'Everyone begins at the same time and finishes with a showcase.']] },
    heads: { journeys: { eyebrow: 'Programs', title: 'What we', em: 'run', kicker: 'Each program says who it is for, how long it runs and what you leave with.' }, gatherings: { eyebrow: 'Info sessions', title: 'Come and', em: 'ask us', kicker: 'Info sessions and demo days show up here.' }, faq: { title: 'Before you', em: 'apply' }, cta: { title: 'Find the program', em: 'that fits.' } },
    faqs: [['Who is it for?', 'Founders with a business that already has customers. Each program says if it takes earlier stages.'], ['What if I miss a session?', 'Sessions are recorded and your group will catch you up.']],
  },
  clubs: {
    who: 'Trade and professional associations: meetings, the member directory, dues and how to join.',
    blocks: ['hero', 'live', 'gatherings', 'steps', 'membership', 'faq', 'cta'],
    hero: 'left', layouts: { gatherings: 'calendar', steps: 'strip', membership: 'table', faq: 'stack', cta: 'split' }, route: 'membership', cta2: { label: 'See when we meet', route: 'workshops' },
    steps: { eyebrow: 'How to join', title: 'Guest first,', em: 'member when ready', items: [['Come as a guest', 'Your first meeting is open. Just say you are new at the door.'], ['Meet the members', 'A board member will introduce you around.'], ['Join', 'Get the directory, the member rate and a vote.']] },
    heads: { gatherings: { eyebrow: 'Calendar', title: 'When we', em: 'meet', kicker: 'Meetings, member socials and the annual dinner.' }, membership: { title: 'What dues', em: 'cover', kicker: 'Dues pay for the room, the speakers and the directory.' }, faq: { title: 'Good to', em: 'know' }, cta: { title: 'Come once.', em: 'See if it fits.' } },
    faqs: [['Who can join?', 'Anyone working in the field.'], ['What do dues cover?', 'The meeting room, speakers, the directory and the annual dinner.']],
    tiers: [['Guest', 'Come to a meeting as our guest.'], ['Member', 'Meetings, the directory and a vote.'], ['Firm', 'Several members from one company.']],
  },
  faith: {
    who: 'Small, confidential peer boards of owners and leaders who meet to work on real decisions.',
    blocks: ['hero', 'steps', 'gatherings', 'library', 'membership', 'faq', 'cta'],
    hero: 'center', layouts: { steps: 'timeline', gatherings: 'calendar', library: 'list', membership: 'tiers', faq: 'split', cta: 'center' }, route: 'membership', cta2: { label: 'Talk to a chair', route: 'contact' },
    steps: { eyebrow: 'How a board works', title: 'What to', em: 'expect', items: [['Apply', 'Tell us about your business and what you want from a board.'], ['Meet the chair', 'A call to make sure the board is a fit for you, and you for it.'], ['Join a board', 'Regular meetings, a one-to-one with your chair and a group that keeps confidences.']] },
    heads: { gatherings: { eyebrow: 'Meetings', title: 'When boards', em: 'meet', kicker: 'Board mornings and the all-boards evenings.' }, library: { eyebrow: 'Notes', title: 'Read', em: 'again', kicker: 'Short notes from past sessions, shared with permission.' }, membership: { eyebrow: 'Membership', title: 'Ways to', em: 'take part', kicker: 'Boards stay small so everyone brings something. Each tier says what is included.' }, faq: { title: 'Questions', em: 'people ask' }, cta: { title: 'Bring the decision', em: 'you are stuck on.' } },
    faqs: [['Is it confidential?', 'Yes. Every member signs the same agreement, and the chair holds the room to it.'], ['How big is a board?', 'Small, so everyone brings something to every meeting.']],
    tiers: [['Explorer', 'Sit in as a guest before you decide.'], ['Board member', 'Your board, chair one-to-ones and the evening events.'], ['Chair track', 'Train to chair a board of your own.']],
    resources: [['On deciding when you are stuck', 'Read'], ['On hiring the first person', 'Read'], ['On saying no', 'Read'], ['On the hard conversation', 'Read']],
  },
  wellness: {
    who: 'Summits, retreats and member trips: dates, tickets, the agenda and a simple way to reserve.',
    blocks: ['hero', 'gatherings', 'offerings', 'steps', 'proof', 'shop', 'faq', 'cta'],
    hero: 'full', layouts: { offerings: 'cards', steps: 'strip', gatherings: 'cards', proof: 'stats', shop: 'grid', faq: 'split', cta: 'band' }, route: 'workshops', cta2: { label: 'See the agenda', route: 'services' },
    steps: { eyebrow: 'Plan your visit', title: 'Simple', em: 'to come', items: [['Reserve', 'Pick a ticket. Members hear first.'], ['Plan', 'The agenda, rooms and travel notes are sent ahead.'], ['Arrive', 'Name tags at the door and a host to say hello.']] },
    heads: { offerings: { eyebrow: 'Agenda', title: 'How the days', em: 'run', kicker: 'Mornings on stage, afternoons at small tables, evenings outside.' }, gatherings: { eyebrow: 'Coming up', title: 'Summits and', em: 'retreats', kicker: 'Dates, places and seats left, in one place.' }, shop: { eyebrow: 'Tickets and gifts', title: 'Bring', em: 'a colleague' }, faq: { title: 'Before', em: 'you come' }, cta: { title: 'Save your seat', em: 'at the summit.' } },
    faqs: [['Can I transfer my ticket?', 'Yes. Send us the new name.'], ['Is there a member price?', 'Ask us about member prices and early access.']],
    offers: [['Day pass', 'One day of talks and tables.'], ['Full summit', 'The whole weekend and the evening dinner.'], ['Retreat', 'A few nights away with members.']],
    products: ['A day pass', 'A full summit ticket', 'A gift ticket', 'A retreat place'],
  },
  markets: {
    who: 'Shop-local alliances and business districts: member businesses, perks, the next market day and how to join as a business.',
    blocks: ['hero', 'live', 'gatherings', 'steps', 'shop', 'membership', 'faq', 'letter', 'cta'],
    hero: 'split', layouts: { gatherings: 'calendar', steps: 'strip', shop: 'rail', faq: 'stack', letter: 'band', cta: 'split' }, route: 'membership', cta2: { label: 'See member perks', route: 'shop' },
    steps: { eyebrow: 'How it works', title: 'For locals', em: 'and businesses', items: [['Check the dates', 'Market days, specials and who is taking part.'], ['Use your card', 'Check in at any member business and earn perks.'], ['Join as a business', 'List your perk, join market days and meet your neighbours.']] },
    heads: { gatherings: { eyebrow: 'Calendar', title: 'Market', em: 'days', kicker: 'Market days, member mornings and the holiday stroll.' }, shop: { eyebrow: 'Member perks', title: 'Perks up', em: 'and down the street' }, membership: { eyebrow: 'For businesses', title: 'Join', em: 'the alliance', kicker: 'Dues fund market days, the loyalty card and shared marketing.' }, faq: { title: 'Good to', em: 'know' }, cta: { title: 'See you on', em: 'market day.' } },
    faqs: [['Who can join?', 'Any independent business in the district.'], ['How does the loyalty card work?', 'Check in at any member business. Points add up across the whole street.']],
    tiers: [['Neighbour', 'Listed in the directory and on the map.'], ['Member business', 'Market days, the loyalty card and a perk listing.'], ['Anchor', 'Sponsor a market day and appear on every poster.']],
    products: ['A coffee card', 'A market day pass', 'A gift card', 'A window walk map'],
    letterBody: 'Market days, new members and the perks on offer.',
  },
}

/** The design system's profile ids, in its order (kits.js KITS): the kit's id is `network-kit-<id>` and the id is also its niche. */
export const NETWORK_KIT_PROFILE_KITS = ['general', 'networks', 'clubs', 'markets', 'hosts', 'creators', 'wellness', 'studios', 'nonprofits', 'schools', 'coaches', 'venues', 'faith'] as const

const star = (title: string, em: string): string => [title, em ? `*${em}*` : ''].filter(Boolean).join(' ')
/** The base blocks' own heads, for a kit that does not rewrite one (the design's BLOCKS fields). */
const BASE_HEADS: Partial<Record<keyof ProfileRow['heads'], Heads>> = {
  journeys: { eyebrow: 'Programs', title: 'Grow with', em: 'a group' },
  membership: { eyebrow: 'Membership', title: 'Show up,', em: 'together' },
  shop: { eyebrow: 'The shop', title: 'Tickets, kits', em: 'and gifts' },
  library: { eyebrow: 'The library', title: 'Share what', em: 'works' },
}
/** The page name for a tool the profile's ways in do not name. */
const TOOL_LABEL: Record<Tool, string> = { gather: 'Meetups', belong: 'Membership', book: 'Services', learn: 'Programs', sell: 'Shop', publish: 'The library' }
const SLUG: Record<string, string> = { gather: 'workshops', belong: 'membership', book: 'services', learn: 'journeys', sell: 'shop', publish: 'resources' }
const GLYPHS = ['circle', 'ring', 'square']

interface Ctx { niche: KitNiche; row: ProfileRow; c: ReturnType<typeof networkKitSpotlightContent>; tools: Set<Tool>; href: (route: string) => string }

function build(id: string, x: Ctx): Block | null {
  const { row, c, tools } = x
  const lay = row.layouts
  const head = (key: keyof ProfileRow['heads']) => {
    const h = row.heads[key] ?? BASE_HEADS[key]
    return h ? { eyebrow: h.eyebrow ?? BASE_HEADS[key]?.eyebrow ?? '', title: star(h.title, h.em), lead: h.kicker ?? '' } : null
  }
  switch (id) {
    case 'hero':
      return { type: 'NetworkKitHero', props: { ...NETWORK_KIT_HERO, variant: row.hero, flip: row.flip === true, eyebrow: c.hero.eyebrow, title: star(c.hero.title, c.hero.em), lead: c.hero.body, primaryLabel: c.cta.label, primaryHref: x.href(row.route), secondaryLabel: row.cta2.label, secondaryHref: x.href(row.cta2.route), image: c.hero.photo, pos: c.hero.pos } }
    case 'live':
      return { type: 'NetworkKitLive', props: { ...NETWORK_KIT_LIVE, items: NETWORK_KIT_LIVE.items.map((it) => (it.label === 'The library' ? { ...it, value: 'Guides and stories' } : it)).filter((it) => (it.source === 'nextEvent' ? tools.has('gather') : it.source === 'journeys' ? tools.has('learn') : it.source === 'members' ? tools.has('belong') : it.label === 'Welcome calls' ? tools.has('book') : true)) } }
    case 'steps':
      return { type: 'NetworkKitSteps', props: { ...NETWORK_KIT_STEPS, variant: lay.steps ?? 'grid', eyebrow: row.steps.eyebrow, title: star(row.steps.title, row.steps.em), steps: row.steps.items.map(([title, body], i) => ({ glyph: NETWORK_KIT_STEPS.steps[i]!.glyph, title, body })) } }
    case 'doors':
      return { type: 'NetworkKitDoors', props: { variant: lay.doors ?? 'grid', eyebrow: row.heads.doors?.eyebrow ?? 'Ways in', title: star(row.heads.doors?.title ?? 'Find your', row.heads.doors?.em ?? 'people'), lead: '', doors: c.doors.map((d, i) => ({ glyph: ['triangle', 'ring', 'target', 'arc', 'shop', 'half'][['gather', 'belong', 'book', 'learn', 'sell', 'publish'].indexOf(d.key)] ?? GLYPHS[i % 3], title: d.title, body: d.meta, href: `~/${SLUG[d.key]}` })), band: '' } }
    case 'offerings': {
      const h = head('offerings') ?? { eyebrow: c.offeringsLabel, title: star(c.offeringsHead.title, c.offeringsHead.em), lead: '' }
      const items = row.offers ? row.offers.map(([name, blurb], i) => ({ glyph: ['circle', 'target', 'spark'][i]!, name, minutes: '', blurb, price: '', href: '~/book' })) : NETWORK_KIT_OFFERINGS.offerings
      return { type: 'NetworkKitOfferings', props: { ...NETWORK_KIT_OFFERINGS, variant: lay.offerings ?? 'list', ...h, eyebrow: h.eyebrow || c.offeringsLabel, offerings: items, actionLabel: '' } }
    }
    case 'journeys': {
      const h = head('journeys')!
      const cards = NETWORK_KIT_JOURNEYS.cards.map((card, i) => ({ ...card, weeks: '', title: ['Host training: run a meetup people come back to', 'Your first months as a member', 'Grow a chapter in your town'][i]! }))
      return { type: 'NetworkKitJourneys', props: { ...NETWORK_KIT_JOURNEYS, variant: lay.journeys ?? 'cards', ...h, cards } }
    }
    case 'gatherings': {
      const h = head('gatherings') ?? { eyebrow: 'Coming up', title: star(c.gatherings.title, c.gatherings.em), lead: '' }
      return { type: 'NetworkKitGatherings', props: { ...NETWORK_KIT_GATHERINGS, variant: lay.gatherings ?? 'split', ...h, image: c.hero.photo.replace(/photo-\d\d/, 'photo-07') } }
    }
    case 'membership': {
      const h = head('membership')!
      const tiers = row.tiers ? row.tiers.map(([name, blurb], i) => ({ glyph: GLYPHS[i]!, name, blurb, price: '', badge: '', href: '~/membership' })) : NETWORK_KIT_MEMBERSHIP.tiers.map((t) => ({ ...t, badge: '' }))
      return { type: 'NetworkKitMembership', props: { ...NETWORK_KIT_MEMBERSHIP, variant: lay.membership ?? 'tiers', ...h, tiers } }
    }
    case 'proof':
      return { type: 'NetworkKitProof', props: { ...NETWORK_KIT_PROOF, variant: lay.proof ?? 'quote' } }
    case 'shop': {
      const h = head('shop')!
      const products = row.products ? NETWORK_KIT_SHOP.products.map((p, i) => ({ ...p, name: row.products![i]! })) : NETWORK_KIT_SHOP.products
      return { type: 'NetworkKitShop', props: { ...NETWORK_KIT_SHOP, variant: lay.shop ?? 'grid', eyebrow: h.eyebrow, title: h.title, products } }
    }
    case 'library': {
      const h = head('library')!
      const resources = row.resources ? NETWORK_KIT_LIBRARY.resources.map((r, i) => ({ ...r, type: 'Note', title: row.resources![i]![0], meta: row.resources![i]![1], price: '' })) : NETWORK_KIT_LIBRARY.resources.map((r) => ({ ...r, price: '' }))
      return { type: 'NetworkKitLibrary', props: { ...NETWORK_KIT_LIBRARY, variant: lay.library ?? 'grid', ...h, resources } }
    }
    case 'letter':
      return { type: 'NetworkKitLetter', props: { ...NETWORK_KIT_LETTER, variant: lay.letter ?? 'band', title: row.letter?.[0] ?? c.letter?.title ?? NETWORK_KIT_LETTER.title, em: row.letter?.[1] ?? c.letter?.em ?? NETWORK_KIT_LETTER.em, lead: row.letterBody ?? NETWORK_KIT_LETTER.lead } }
    case 'faq': {
      const h = row.heads.faq ?? { title: 'Good to', em: 'know' }
      return { type: 'NetworkKitFAQ', props: { ...NETWORK_KIT_FAQ, variant: lay.faq ?? 'split', eyebrow: 'Questions', title: star(h.title, h.em), items: (row.faqs ?? []).map(([q, a]) => ({ q, a })) } }
    }
    case 'cta': {
      const h = row.heads.cta ?? { title: 'Come once.', em: 'Bring a friend.' }
      return { type: 'NetworkKitCTA', props: { ...NETWORK_KIT_CTA, variant: lay.cta ?? 'center', title: star(h.title, h.em), buttonLabel: c.cta.label, buttonHref: x.href(row.route), secondaryLabel: row.cta2.label, secondaryHref: x.href(row.cta2.route), image: c.hero.photo } }
    }
    // The design's thirteen extra blocks: only the General kit switches them on.
    case 'featured': return { type: 'NetworkKitFeatured', props: { ...NETWORK_KIT_FEATURED } }
    case 'venue': return { type: 'NetworkKitVenue', props: { ...NETWORK_KIT_VENUE } }
    case 'calendar': return { type: 'NetworkKitCalendar', props: { ...NETWORK_KIT_CALENDAR } }
    case 'chapters': return { type: 'NetworkKitChapters', props: { ...NETWORK_KIT_CHAPTERS } }
    case 'circles': return { type: 'NetworkKitCircles', props: { ...NETWORK_KIT_CIRCLES } }
    case 'stats': return { type: 'NetworkKitStats', props: { ...NETWORK_KIT_STATS } }
    case 'note': return { type: 'NetworkKitNote', props: { ...NETWORK_KIT_NOTE } }
    case 'pillars': return { type: 'NetworkKitPillars', props: { ...NETWORK_KIT_PILLARS } }
    case 'rooms': return { type: 'NetworkKitRooms', props: { ...NETWORK_KIT_ROOMS } }
    case 'podcast': return { type: 'NetworkKitPodcast', props: { ...NETWORK_KIT_PODCAST } }
    case 'social': return { type: 'NetworkKitSocial', props: { ...NETWORK_KIT_SOCIAL } }
    case 'merch': return { type: 'NetworkKitMerch', props: { ...NETWORK_KIT_MERCH } }
    case 'contact': return { type: 'NetworkKitContact', props: { ...NETWORK_KIT_CONTACT } }
    default: return null
  }
}

/** The design's block order for the home, closed by the fixed closing call. */
function homeBlocks(x: Ctx): Block[] {
  return withBands(x.row.blocks.map((id) => build(id, x)).filter((b): b is Block => !!b))
}

/** A plain page header: the Network hero, set to the left, with the profile's photo and a title of the page's own. */
function pageHeader(x: Ctx, eyebrow: string, title: string, lead: string, photo: string): Block {
  return { type: 'NetworkKitHero', props: { ...NETWORK_KIT_HERO, variant: 'split', flip: true, eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: x.c.hero.photo.replace(/photo-\d\d/, photo), pos: '', showEvent: false } }
}

const withProps = (b: Block, props: Record<string, unknown>): Block => ({ ...b, props: { ...b.props, ...props } })

function pages(x: Ctx): KitPage[] {
  const { row, c, tools } = x
  const closing = build('cta', x)!
  const label = (tool: Tool) => c.doors.find((d) => d.key === tool)?.title ?? TOOL_LABEL[tool]
  const out: KitPage[] = [{ slug: 'home', label: 'Home', seo: { title: networkKitProfileName(x.niche), description: row.who }, blocks: homeBlocks(x) }]
  // The header says the page's name, so the section under it drops its own heading; the letter keeps its words.
  const bare = (b: Block): Block => (b.type === 'NetworkKitLetter' ? b : { ...b, props: { ...b.props, eyebrow: '', title: '', lead: '' } })
  const add = (slug: string, name: string, eyebrow: string, title: string, lead: string, photo: string, body: Block[]) =>
    out.push({ slug, label: name, seo: { title: name, description: lead || row.who }, blocks: withBands([pageHeader(x, eyebrow, title, lead, photo), ...body.map(bare), closing]) })
  if (tools.has('gather')) add('workshops', label('gather'), '', star(c.gatherings.title, c.gatherings.em), row.heads.gatherings?.kicker ?? '', 'photo-07', [withProps(build('gatherings', x)!, { variant: 'calendar', count: 12 })])
  if (tools.has('book')) add('services', label('book'), '', star(c.offeringsHead.title, c.offeringsHead.em), row.heads.offerings?.kicker ?? '', 'photo-10', [build('offerings', x)!])
  if (tools.has('learn')) add('journeys', label('learn'), '', star(row.heads.journeys?.title ?? 'What we', row.heads.journeys?.em ?? 'run'), row.heads.journeys?.kicker ?? '', 'photo-05', [withProps(build('journeys', x)!, { variant: 'cards' })])
  if (tools.has('belong')) add('membership', label('belong'), '', star(row.heads.membership?.title ?? 'Show up,', row.heads.membership?.em ?? 'together'), row.heads.membership?.kicker ?? '', 'photo-12', [withProps(build('membership', x)!, { variant: 'tiers' })])
  if (tools.has('sell')) add('shop', label('sell'), '', star(row.heads.shop?.title ?? 'Tickets, kits', row.heads.shop?.em ?? 'and gifts'), '', 'photo-08', [withProps(build('shop', x)!, { variant: 'grid' })])
  add('resources', label('publish'), '', star(row.heads.library?.title ?? 'Share what', row.heads.library?.em ?? 'works'), row.heads.library?.kicker ?? '', 'photo-06', [withProps(build('library', x)!, { variant: 'grid' }), build('letter', x)!])
  add('about', 'About', '', 'A friendly room,\n*run by people like you.*', row.who, 'photo-09', [{ type: 'NetworkKitPillars', props: { ...NETWORK_KIT_PILLARS } }])
  return out
}

/** The Network Theme Kit profile kit for one niche. Id is `network-kit-<niche>`. */
export function networkKitProfileKit(niche: KitNiche): SiteKit {
  const row = ROW[niche]
  if (!row) throw new Error(`No Network Theme Kit profile kit for ${niche}`)
  const c = networkKitSpotlightContent(niche, { sample: true })
  const tools = new Set<Tool>([...c.doors.map((d) => d.key as Tool), ...(row.more ?? [])])
  const x: Ctx = { niche, row, c, tools, href: (route) => `~/${route}` }
  return { id: `network-kit-${niche}`, label: networkKitProfileName(niche), description: row.who, theme: 'NetworkKit', version: 1, niche, pages: pages(x) }
}
