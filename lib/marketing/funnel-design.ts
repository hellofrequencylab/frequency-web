// THE SIX DOORS, DESIGN HALF (/for/<niche> on the Frequency design). funnel-config.ts holds every WORD a
// door says (the same copy DAWN and the metadata read); this file holds what only the Frequency body draws:
// the photos, the evolving card's feed, the Space galaxy, the screen under each step, the tool previews and
// the planet notes. Pure data, no prices (prices come from the catalog through funnel-config), no JSX.
// Source: Claude Design's niche-data.js / niche.js handoff (2026-10-22).
import type { FqIconName } from '@/components/frequency/icon'

/** The photos live in public/brand/frequency/photos. */
export const NICHE_PHOTO_DIR = '/brand/frequency/photos'

/** The screen drawn under a how-it-works step. */
export type StepScreen = 'page' | 'list' | 'cal' | 'pay' | 'invite' | 'check' | 'verify' | 'gift'

/** The H1 as the design sets it: a lead, then the iridescent italic part on its own lines. */
interface NicheH1 {
  lead: string
  em: readonly string[]
  /** Break the line between the lead and the italic part (the Coaches door). */
  br?: boolean
}

interface NicheDesign {
  /** The breadcrumb name and the example Space's subtitle. */
  short: string
  photo: string
  interlude: string
  /** What the evolving card calls the reader's thing: "Your practice". */
  you: string
  h1: NicheH1
  /** The card's feed: icon, title, line. */
  events: readonly (readonly [FqIconName, string, string])[]
  /** The six planets around "You" (keys of PLANET_NOTES). */
  planets: readonly string[]
  screens: readonly StepScreen[]
  tools: readonly ToolId[]
  /** One icon per feature card, in order. */
  featureIcons: readonly FqIconName[]
}

export type ToolId =
  | 'bookings'
  | 'contacts'
  | 'email'
  | 'programs'
  | 'practices'
  | 'qr'
  | 'airwaves'
  | 'memberships'
  | 'shop'
  | 'circles'
  | 'events'
  | 'collaborators'
  | 'chapters'
  | 'reports'
  | 'donations'

/** One row of a tool preview: icon, title, line, and an optional status pill (on = the highlighted one). */
type ToolRow = readonly [icon: FqIconName, title: string, line: string, pill?: string, on?: boolean]

interface ToolPreview {
  icon: FqIconName
  name: string
  sub: string
  title: string
  lead: string
  rows: readonly ToolRow[]
  cta: string
}

const TOOLS: Record<ToolId, ToolPreview> = {
  bookings: {
    icon: 'clock',
    name: 'Bookings',
    sub: 'Sessions people book themselves',
    title: 'Book a session',
    lead: 'Times you set. People pick one.',
    rows: [
      ['clock', 'Tuesday · 10:00', '60 minutes', 'Open'],
      ['clock', 'Tuesday · 14:00', 'Intro call · 20 minutes', 'Booked', true],
      ['clock', 'Thursday · 09:00', '60 minutes', 'Open'],
    ],
    cta: 'Share booking link',
  },
  contacts: {
    icon: 'contacts',
    name: 'Contacts',
    sub: 'Look back at the people you meet',
    title: 'Your people',
    lead: "See who’s new and who checked in before.",
    rows: [
      ['user', 'First visit', 'Came in this week', 'New', true],
      ['user', 'Came back', 'Third time', 'Regular'],
      ['user', 'Past visit', 'Check-in history', 'View'],
    ],
    cta: 'Import a list',
  },
  email: {
    icon: 'message',
    name: 'Email',
    sub: 'Short notes to your list',
    title: 'Write a note',
    lead: 'Plain emails from your name, to your list.',
    rows: [
      ['message', 'Reminder for tomorrow', 'Goes to people who said yes', 'Scheduled', true],
      ['message', 'Thank you for coming', 'Goes to first visits', 'Draft'],
      ['message', 'Next gathering', 'An invitation to your contacts', 'Draft'],
    ],
    cta: 'New email',
  },
  programs: {
    icon: 'program',
    name: 'Programs',
    sub: 'Work that runs over several sessions',
    title: 'Six-session program',
    lead: 'A path people move through together.',
    rows: [
      ['program', 'Session 1 · Start here', 'Done', 'Done'],
      ['program', 'Session 2 · Practice', 'Next up', 'Next', true],
      ['program', 'Session 3 · Going further', 'Locked until session 2', 'Later'],
    ],
    cta: 'Add a session',
  },
  practices: {
    icon: 'practice',
    name: 'Practices',
    sub: 'Things people do between sessions',
    title: 'Practices',
    lead: 'Short guides people come back to at home.',
    rows: [
      ['practice', 'Five-minute sit', 'Audio · 5 min', 'Shared', true],
      ['practice', 'Morning routine', 'Steps · 10 min', 'Draft'],
      ['practice', 'Before you arrive', 'Note · 2 min', 'Shared'],
    ],
    cta: 'Add a practice',
  },
  qr: {
    icon: 'qr',
    name: 'QR codes',
    sub: 'Check people in at the door',
    title: 'Door check-in',
    lead: 'Invite people to check in with your door QR. Check-ins appear in Contacts.',
    rows: [
      ['checkin', 'Checked in', 'Just now', 'First visit', true],
      ['checkin', 'Checked in', '4 minutes ago', 'Regular'],
      ['checkin', 'Checked in', '9 minutes ago', 'Regular'],
    ],
    cta: 'Print your QR',
  },
  airwaves: {
    icon: 'sound',
    name: 'Airwaves',
    sub: 'Audio people can listen back to',
    title: 'Airwaves',
    lead: 'Recordings and short audio for your people.',
    rows: [
      ['sound', 'Opening talk', 'Audio · 12 min', 'Live', true],
      ['sound', 'Guided session', 'Audio · 20 min', 'Draft'],
    ],
    cta: 'Upload audio',
  },
  memberships: {
    icon: 'membership',
    name: 'Memberships',
    sub: 'Offer recurring memberships on Business',
    title: 'Memberships',
    lead: 'Set a membership plan and review its billing details.',
    rows: [
      ['membership', 'Unlimited', 'Monthly · you set the price', 'Active', true],
      ['membership', 'Ten-class pack', 'Use within three months', 'Active'],
      ['membership', 'Payment paused', 'Member asked to pause', 'Paused'],
    ],
    cta: 'Add a plan',
  },
  shop: {
    icon: 'tag',
    name: 'Shop',
    sub: 'Sell a few things you stock',
    title: 'Shop',
    lead: 'A few items, sold from your page.',
    rows: [
      ['tag', 'Mat towel', 'In stock', 'Live', true],
      ['tag', 'Gift card', 'Digital', 'Live'],
    ],
    cta: 'Add an item',
  },
  circles: {
    icon: 'circle',
    name: 'Circles',
    sub: 'A standing time and a real room',
    title: 'Your Circle',
    lead: 'A standing time, a real place, the same faces.',
    rows: [
      ['circle', 'Thursday · 18:30', 'The park by the pier', 'Next', true],
      ['user', 'Who came last time', 'Familiar faces and two new ones', 'See list'],
      ['invite', 'Invite link', 'Share anywhere', 'Copy'],
    ],
    cta: 'Open your Circle',
  },
  events: {
    icon: 'event',
    name: 'Events',
    sub: 'One-off nights on the town calendar',
    title: 'Post an event',
    lead: 'Post the date on the local calendar.',
    rows: [
      ['event', 'Saturday night', 'Free · RSVP', 'Posted', true],
      ['ticket', 'Ticketed night', 'Paid tickets on Business', 'Later'],
    ],
    cta: 'Post an event',
  },
  collaborators: {
    icon: 'invite',
    name: 'Collaborators',
    sub: 'Co-hosts, staff and volunteers',
    title: 'Your team',
    lead: 'People who help run things, with their own sign-in.',
    rows: [
      ['user', 'Co-host', 'Can post and check in', 'Invited', true],
      ['user', 'Volunteer', 'Can check in', 'Active'],
    ],
    cta: 'Invite someone',
  },
  chapters: {
    icon: 'globe',
    name: 'Chapters',
    sub: 'Every chapter under your name',
    title: 'Your chapters',
    lead: 'Each one with its own page, calendar and organizers.',
    rows: [
      ['globe', 'Oceanside', 'Opened this month', 'New', true],
      ['globe', 'Carlsbad', 'Three events this week', 'Active'],
      ['globe', 'Encinitas', 'Two organizers', 'Active'],
    ],
    cta: 'Open a chapter',
  },
  reports: {
    icon: 'chart',
    name: 'Reports',
    sub: 'One view across every chapter',
    title: 'This month',
    lead: 'Who came, where, across every chapter.',
    rows: [
      ['chart', 'Check-ins by chapter', 'All chapters', 'View', true],
      ['user', 'Network members', 'Across your chapters', 'View'],
    ],
    cta: 'Open the report',
  },
  donations: {
    icon: 'giveback',
    name: 'Donations',
    sub: 'Gifts with a receipt',
    title: 'Give',
    lead: 'Offer donations on the Non Profit plan, with receipts for gifts.',
    rows: [
      ['giveback', 'One-time gift', 'Receipt sent', 'Received', true],
      ['giveback', 'Monthly gift', 'Recurring donation', 'Active'],
      ['message', 'Thank-you note', 'Goes out with the receipt', 'On'],
    ],
    cta: 'Add a donate button',
  },
}

/** A tool's preview for a door (the Programs example reads differently on a Non Profit door). */
export function toolPreview(id: ToolId, slug: string): ToolPreview {
  const t = TOOLS[id]
  return id === 'programs' && slug === 'nonprofits' ? { ...t, title: 'Youth arts program' } : t
}

/** The note a planet opens, and the tool it points at. */
export const PLANET_NOTES: Record<string, readonly [note: string, tool: string]> = {
  Bookings: ['People pick a time you set. It lands with their name and their history.', 'Bookings'],
  Payments: ['Take payment for a session on Business and keep the booking details.', 'Bookings'],
  'Client notes': ['Notes live on the client, ready before they walk in.', 'Contacts'],
  Email: ['Short notes from your name to the right people.', 'Email'],
  Packages: ['Sell five or ten sessions at once, and see what is left on each.', 'Bookings'],
  Programs: ['Sessions people move through together, with progress you can see.', 'Programs'],
  Contacts: ['Look back at your contacts and check-in history.', 'Contacts'],
  Classes: ['Your timetable, with spots, times and who is coming.', 'Bookings'],
  Memberships: ['Offer recurring memberships on Business and see member check-ins.', 'Memberships'],
  'Check-in': ['Invite people to check in at the door. See their check-ins in Contacts.', 'QR codes'],
  Waivers: ['Signed once and kept with the member.', 'Contacts'],
  Tickets: ['Offer paid tickets on Business and see bookings for your event.', 'Events'],
  RSVPs: ['Know who is coming before you set out the chairs.', 'Events'],
  Reminders: ['A note the day before, sent for you.', 'Email'],
  Events: ['Share your gathering dates on the local calendar.', 'Events'],
  Calendar: ['Every gathering at your room, in one place.', 'Events'],
  Hosts: ['The groups that use your room, each on their own page.', 'Collaborators'],
  Donations: ['Offer one-time and recurring gifts on the Non Profit plan, with receipts.', 'Donations'],
  Supporters: ['Keep supporter contacts and look back at their involvement.', 'Contacts'],
  Receipts: ['Sent on their own, with a thank-you.', 'Donations'],
  Chapters: ['Each chapter with its own page, calendar and people.', 'Chapters'],
  Members: ['A network membership across its chapters.', 'Contacts'],
  Reports: ['Review participation across your chapters.', 'Reports'],
  Organizers: ['Chapter leads with their own sign-in.', 'Collaborators'],
  // The seven profile doors (LIVE-1512 follow-up).
  'Your page': ['Your hours, your work and how to reach you, in one place.', 'Your page'],
  Shop: ['List what you make or sell. Checkout opens on Business.', 'Shop'],
  Courses: ['A course people move through together, with enrollment you can see.', 'Programs'],
  Enrollment: ['Students sign up from your page and land on your roster.', 'Programs'],
  Meetups: ['Post the date once and take RSVPs.', 'Events'],
  Dues: ['Offer a membership on Business and let people pay from your page.', 'Memberships'],
  Groups: ['Small groups and classes, each with its own sign-up.', 'Programs'],
  Giving: ['One-time and recurring gifts on the Non Profit plan, with receipts.', 'Donations'],
  Retreats: ['A retreat date with deposits on Business.', 'Events'],
  Vendors: ['The makers and stalls on your lineup, each on their own page.', 'Collaborators'],
  Gate: ['Visitors check in as they arrive, so you can reach them next time.', 'QR codes'],
}

/** The tool a planet note names, as its icon (falls back to the page glyph). */
export function planetIcon(tool: string): FqIconName {
  const hit = Object.values(TOOLS).find((t) => t.name === tool)
  return hit ? hit.icon : 'page'
}

/** The galaxy's six planet positions: left %, top %, size px (the design's hex ring). */
export const PLANET_POSITIONS: readonly (readonly [number, number, number])[] = [
  [17, 30, 26],
  [50, 11, 22],
  [83, 30, 28],
  [83, 70, 24],
  [50, 86, 26],
  [17, 70, 22],
]

/** The design's per-door facts, keyed by the /for slug. */
export const NICHE_DESIGN: Record<string, NicheDesign> = {
  'coaches-and-healers': {
    short: 'Coaches and guides',
    photo: 'day-meditation-circle.jpg',
    interlude: 'gathering-14.jpg',
    you: 'Your practice',
    h1: { lead: "You're good with people.", em: ['Keep the paperwork out of the way.'], br: true },
    events: [
      ['message', 'Reminder sent', "Tomorrow's 10:00 session"],
      ['user', 'First visit', 'Checked in and added to Contacts'],
      ['clock', 'New booking', 'Tuesday · 14:00 intro call'],
      ['wallet', 'Package paid', 'Five sessions'],
      ['message', 'Follow-up due', 'Second session this week'],
      ['user', 'Rebooked', 'Second session, Thursday'],
    ],
    planets: ['Bookings', 'Payments', 'Client notes', 'Email', 'Packages', 'Contacts'],
    screens: ['page', 'list', 'cal'],
    tools: ['bookings', 'contacts', 'email', 'programs', 'qr'],
    featureIcons: ['event', 'contacts', 'qr', 'nudge'],
  },
  studios: {
    short: 'Studios and instructors',
    photo: 'gathering-05.jpg',
    interlude: 'gathering-12.jpg',
    you: 'Your studio',
    h1: { lead: 'You teach the class.', em: ['Keep the bookings close.'] },
    events: [
      ['checkin', 'Checked in', 'The 6:00 class'],
      ['membership', 'Dues paid', 'Unlimited plan renewed'],
      ['nudge', 'Lapsing', 'A friendly note went out'],
      ['user', 'New member', 'Joined from your link'],
      ['clock', 'Class booking', 'A place reserved'],
      ['checkin', 'Came back', 'First class in a month'],
    ],
    planets: ['Classes', 'Memberships', 'Check-in', 'Waivers', 'Email', 'Contacts'],
    screens: ['page', 'list', 'pay'],
    tools: ['memberships', 'bookings', 'contacts', 'qr', 'email'],
    featureIcons: ['event', 'contacts', 'qr', 'nudge'],
  },
  'event-hosts': {
    short: 'Event hosts',
    photo: 'night-string-lights-web.jpg',
    interlude: 'gathering-08.jpg',
    you: 'Your events',
    h1: { lead: 'A great gathering deserves a way', em: ['to remember the people in it.'] },
    events: [
      ['ticket', 'Ticket sold', 'Saturday night'],
      ['checkin', 'Checked in', 'First visit'],
      ['message', 'Reminder sent', 'The day before'],
      ['user', 'Came back', 'Second event'],
      ['invite', 'Friend invited', "From last month's guest"],
      ['ticket', 'Next date posted', 'An invitation for past guests'],
    ],
    planets: ['Tickets', 'Check-in', 'RSVPs', 'Reminders', 'Events', 'Contacts'],
    screens: ['page', 'invite', 'check'],
    tools: ['events', 'qr', 'contacts', 'email', 'circles'],
    featureIcons: ['ticket', 'contacts', 'qr', 'nudge'],
  },
  venues: {
    short: 'Venues',
    photo: 'gathering-11.jpg',
    interlude: 'gathering-09.jpg',
    you: 'Your venue',
    h1: { lead: 'A home for every group', em: ['that meets in your space.'] },
    events: [
      ['event', 'New booking', 'Thursday · run club'],
      ['checkin', 'Checked in', 'Saturday supper club'],
      ['user', 'First visit', 'Added to your list'],
      ['ticket', 'Pass sold', 'Ten-visit pass'],
      ['invite', 'Host request', 'A game night wants Fridays'],
      ['message', 'Reminder sent', "Tomorrow's hosts"],
    ],
    planets: ['Calendar', 'Hosts', 'Check-in', 'Tickets', 'Email', 'Contacts'],
    screens: ['page', 'cal', 'check'],
    tools: ['events', 'collaborators', 'qr', 'contacts', 'email'],
    featureIcons: ['event', 'qr', 'contacts', 'ticket'],
  },
  nonprofits: {
    short: 'Non Profits',
    photo: 'day-parachute-play.jpg',
    interlude: 'gathering-03.jpg',
    you: 'Your organization',
    h1: { lead: 'The people who believe in your work deserve to be known.', em: ['We take no cut.'] },
    events: [
      ['giveback', 'Gift received', 'Receipt sent'],
      ['user', 'New supporter', 'Added to Contacts'],
      ['message', 'Thank-you sent', 'With the receipt'],
      ['program', 'Enrolled', 'Youth arts program'],
      ['giveback', 'Monthly gift', 'Renewed on its own'],
      ['checkin', 'Event check-in', 'Saturday volunteers'],
    ],
    planets: ['Donations', 'Supporters', 'Programs', 'Receipts', 'Events', 'Email'],
    screens: ['page', 'list', 'gift'],
    tools: ['donations', 'programs', 'contacts', 'email', 'qr'],
    featureIcons: ['giveback', 'event', 'qr', 'nudge'],
  },
  networks: {
    short: 'Networks',
    photo: 'gathering-02.jpg',
    interlude: 'gathering-10.jpg',
    you: 'Your Network',
    h1: { lead: 'Every chapter is its own circle.', em: ['Keep them connected.'] },
    events: [
      ['globe', 'New chapter', 'Oceanside is open'],
      ['user', 'Member moved', 'Carlsbad to Encinitas'],
      ['chart', 'Report ready', 'Every chapter this month'],
      ['event', 'Event posted', 'Vista chapter'],
      ['checkin', 'Checked in', 'Oceanside chapter'],
      ['invite', 'Organizer added', 'Encinitas chapter'],
    ],
    planets: ['Chapters', 'Calendar', 'Members', 'Reports', 'Organizers', 'Email'],
    screens: ['page', 'invite', 'list'],
    tools: ['chapters', 'events', 'contacts', 'reports', 'email'],
    featureIcons: ['event', 'contacts', 'globe', 'chart'],
  },
  // The seven profile doors (LIVE-1512 follow-up). Photos come from the shared gathering set until a
  // profile has its own picture.
  'local-businesses': {
    short: 'Local businesses',
    photo: 'gathering-03.jpg',
    interlude: 'gathering-11.jpg',
    you: 'Your business',
    h1: { lead: 'You run the business.', em: ['Keep your people close to it.'] },
    events: [
      ['event', 'Booked', 'Thu 10:00am, Maya'],
      ['user', 'New contact', 'Met at the counter'],
      ['qr', 'Card saved', 'Scanned at the register'],
      ['message', 'Note sent', 'New hours this week'],
      ['checkin', 'Checked in', 'Saturday open house'],
      ['nudge', 'Reminder sent', 'Tomorrow 10:00am'],
    ],
    planets: ['Your page', 'Bookings', 'Contacts', 'Email', 'Events', 'Shop'],
    screens: ['page', 'list', 'cal'],
    tools: ['bookings', 'contacts', 'qr', 'email', 'shop'],
    featureIcons: ['event', 'contacts', 'qr', 'nudge'],
  },
  creators: {
    short: 'Creators',
    photo: 'gathering-05.jpg',
    interlude: 'gathering-12.jpg',
    you: 'Your work',
    h1: { lead: 'You make the work.', em: ['Give it a home that isn’t a feed.'] },
    events: [
      ['photo', 'Piece posted', 'New in the shop'],
      ['user', 'Joined your list', 'From the opening'],
      ['qr', 'Card saved', 'Scanned at the market'],
      ['event', 'Show posted', 'Sat 6:00pm'],
      ['message', 'Note sent', 'The next drop'],
      ['wallet', 'Sold', 'Business shop'],
    ],
    planets: ['Your page', 'Shop', 'Contacts', 'Email', 'Events', 'Classes'],
    screens: ['page', 'list', 'invite'],
    tools: ['shop', 'contacts', 'qr', 'email', 'events'],
    featureIcons: ['photo', 'contacts', 'qr', 'send'],
  },
  'schools-and-programs': {
    short: 'Schools and programs',
    photo: 'gathering-06.jpg',
    interlude: 'gathering-13.jpg',
    you: 'Your school',
    h1: { lead: 'You teach the course.', em: ['Keep the enrollment simple.'] },
    events: [
      ['program', 'Enrolled', 'Spring course, Leo'],
      ['checkin', 'Checked in', 'Week 3 session'],
      ['user', 'New student', 'From the open day'],
      ['nudge', 'Reminder sent', 'Tomorrow 6:00pm'],
      ['message', 'Note sent', 'Alumni, next term'],
      ['event', 'Course posted', 'Starts in May'],
    ],
    planets: ['Courses', 'Enrollment', 'Contacts', 'Check-in', 'Reminders', 'Email'],
    screens: ['page', 'list', 'check'],
    tools: ['programs', 'contacts', 'qr', 'email', 'events'],
    featureIcons: ['event', 'contacts', 'checkin', 'nudge'],
  },
  'clubs-and-groups': {
    short: 'Clubs and groups',
    photo: 'gathering-07.jpg',
    interlude: 'gathering-14.jpg',
    you: 'Your group',
    h1: { lead: 'You keep the group going.', em: ['Let the admin stop eating the fun.'] },
    events: [
      ['event', 'Meetup posted', 'Tue 7:00pm'],
      ['user', 'New member', 'Came last week'],
      ['checkin', 'Checked in', 'Tuesday meetup'],
      ['membership', 'Dues paid', 'Business'],
      ['message', 'Note sent', 'Who is coming?'],
      ['qr', 'Card saved', 'Scanned at the door'],
    ],
    planets: ['Meetups', 'RSVPs', 'Contacts', 'Dues', 'Check-in', 'Email'],
    screens: ['page', 'cal', 'invite'],
    tools: ['events', 'contacts', 'qr', 'memberships', 'email'],
    featureIcons: ['event', 'contacts', 'qr', 'membership'],
  },
  'faith-communities': {
    short: 'Faith communities',
    photo: 'day-meditation-circle.jpg',
    interlude: 'gathering-08.jpg',
    you: 'Your community',
    h1: { lead: 'Your people already gather.', em: ['Give them one place to find each other.'] },
    events: [
      ['event', 'Service posted', 'Sun 10:00am'],
      ['user', 'Newcomer', 'First visit Sunday'],
      ['program', 'Joined a group', 'Wednesday circle'],
      ['giveback', 'Gift received', 'Recurring'],
      ['message', 'Note sent', 'This week'],
      ['checkin', 'Checked in', 'Sunday service'],
    ],
    planets: ['Events', 'Groups', 'Contacts', 'Giving', 'Receipts', 'Email'],
    screens: ['page', 'list', 'gift'],
    tools: ['events', 'programs', 'contacts', 'donations', 'email'],
    featureIcons: ['event', 'contacts', 'giveback', 'send'],
  },
  'wellness-and-retreats': {
    short: 'Wellness and retreats',
    photo: 'day-park-yoga.jpg',
    interlude: 'gathering-09.jpg',
    you: 'Your practice',
    h1: { lead: 'You hold the space.', em: ['Let the bookings hold themselves.'] },
    events: [
      ['event', 'Booked', 'Fri 9:00am, Sam'],
      ['user', 'New client', 'Intake saved'],
      ['ticket', 'Retreat deposit', 'Business'],
      ['nudge', 'Reminder sent', 'Tomorrow 9:00am'],
      ['qr', 'Card saved', 'After a session'],
      ['message', 'Note sent', 'Spring retreat'],
    ],
    planets: ['Bookings', 'Client notes', 'Retreats', 'Payments', 'Reminders', 'Email'],
    screens: ['page', 'cal', 'pay'],
    tools: ['bookings', 'contacts', 'qr', 'events', 'email'],
    featureIcons: ['event', 'contacts', 'qr', 'nudge'],
  },
  'markets-and-festivals': {
    short: 'Markets and festivals',
    photo: 'night-string-lights-web.jpg',
    interlude: 'gathering-04.jpg',
    you: 'Your market',
    h1: { lead: 'You bring the whole town out.', em: ['Keep the vendors and the crowd in one place.'] },
    events: [
      ['event', 'Market posted', 'Sat 9:00am'],
      ['host', 'Vendor added', 'Lineup page live'],
      ['checkin', 'Checked in', 'At the gate'],
      ['ticket', 'Ticket sold', 'Business'],
      ['message', 'Note sent', 'Next market day'],
      ['user', 'New contact', 'From the gate'],
    ],
    planets: ['Events', 'Vendors', 'Gate', 'Tickets', 'Contacts', 'Email'],
    screens: ['page', 'invite', 'check'],
    tools: ['events', 'collaborators', 'qr', 'contacts', 'email'],
    featureIcons: ['event', 'host', 'checkin', 'send'],
  },
}
