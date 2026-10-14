// The Features page's content, from templates/website/Features.html verbatim (except the calendar, which
// guidelines/messaging.md names "What's happening", overruling the prototype's "Your town's calendar"): two halves (people,
// spaces), four jobs each, every feature with its three steps and "What changes" line. The ids are the
// design's anchors (#f-zaps, #f-doorqr, ...) and the rest of the site links to them, so they are a
// contract: rename one and grep for `feature('<id>')` first.

import type { FqIconName } from '@/components/frequency/icon'

export interface Feature {
  id: string
  icon: FqIconName
  name: string
  line: string
  /** Spaces only: the plan that carries it. */
  tier?: 'Free' | 'Business'
  steps: [string, string, string]
  changes: string
}

export interface Job {
  title: string
  line: string
  photo: string
  features: Feature[]
}

export interface Half {
  id: 'people' | 'spaces'
  label: string
  sub: string
  heading: string
  jobs: Job[]
}

export const PEOPLE: Half = {
  id: 'people',
  label: 'For people',
  sub: 'All free, forever',
  heading: 'From a stranger to a regular.',
  jobs: [
    {
      title: 'Find',
      line: 'See what’s happening near you.',
      photo: 'day-park-yoga.jpg',
      features: [
        { id: 'f-calendar', icon: 'event', name: 'What’s happening', line: 'Everything meeting near you this week, in one place.', steps: ['Set your town once.', 'Browse Circles, events and programs by day.', 'Filter by what you like doing and when you’re free.'], changes: 'You find something for Thursday in a minute, not an evening of scrolling.' },
        { id: 'f-circles', icon: 'circle', name: 'Circles', line: 'Small groups around one thing, with familiar faces when you return.', steps: ['Pick a Circle that meets at a time you’re free.', 'Show up. The Host knows you’re coming.', 'Come back next week to the same faces.'], changes: 'A standing plan with people who expect you.' },
        { id: 'f-events', icon: 'ticket', name: 'Events', line: 'One-off gatherings worth going out for.', steps: ['RSVP, or buy a ticket if the Space charges.', 'Get a reminder the day before.', 'Walk in with your ticket on your phone.'], changes: 'Something to look forward to, already in your calendar.' },
        { id: 'f-programs', icon: 'program', name: 'Programs', line: 'A few weeks with the same group, start to finish.', steps: ['Join before the first week.', 'Move through each session together.', 'Finish as a group and earn a trophy.'], changes: 'A shared goal, and people who finished it with you.' },
      ],
    },
    {
      title: 'Show up',
      line: 'Walk in. You’re counted.',
      photo: 'day-parachute-play.jpg',
      features: [
        { id: 'f-checkin', icon: 'checkin', name: 'Check-in', line: 'Scan at the door and you’re in.', steps: ['Open your phone camera at the door.', 'Scan the Space’s QR code.', 'You’re checked in, and the Zaps land.'], changes: 'Being in the room counts. Scrolling doesn’t.' },
        { id: 'f-reminders', icon: 'nudge', name: 'Reminders', line: 'A nudge before your Circle or event.', steps: ['RSVP or join a Circle.', 'Get a reminder the day before.', 'Change plans with one tap if you can’t make it.'], changes: 'Fewer missed Thursdays.' },
      ],
    },
    {
      title: 'Come back',
      line: 'Same people, same time.',
      photo: 'day-meditation-circle.jpg',
      features: [
        { id: 'f-zaps', icon: 'zap', name: 'Zaps', line: 'Points for real-world acts, nothing else.', steps: ['Check in at a gathering.', 'Finish something with your Circle.', 'Bring a friend to their first one.'], changes: 'Showing up becomes the game.' },
        { id: 'f-seasons', icon: 'event', name: 'Seasons', line: 'Thirteen weeks, then a fresh start.', steps: ['A season starts for everyone at once.', 'Ranks come from finishing things with people.', 'It resets, so nobody chases a number forever.'], changes: 'A rhythm with no streak guilt.' },
        { id: 'f-meter', icon: 'circle', name: 'Circle meter', line: 'Your Circle fills it together.', steps: ['Every check-in moves your Circle’s meter.', 'The local board is shared, with no global leaderboard.', 'A full meter unlocks something for the whole Circle.'], changes: 'You win together, never against each other.' },
        { id: 'f-membership-p', icon: 'membership', name: 'Memberships', line: 'Your spot, saved whenever you come.', steps: ['Pick a Space you keep going back to.', 'Join their membership.', 'You land straight in your Circle, whenever you show up.'], changes: 'A place that’s yours.' },
      ],
    },
    {
      title: 'Pass it on',
      line: 'Bring someone. Then host.',
      photo: 'day-beach-hoop.jpg',
      features: [
        { id: 'f-invites', icon: 'message', name: 'Invites', line: 'Bring a friend in one tap.', steps: ['Send an invite link anyone can open.', 'They RSVP without an account.', 'You both earn Zaps when they check in.'], changes: 'The best nights get passed along.' },
        { id: 'f-host', icon: 'host', name: 'Host an experience', line: 'Your living room, garden or park counts.', steps: ['Pick a Starter Circle format.', 'Share your invite link.', 'Check people in at your door.'], changes: 'You become somebody’s regular.' },
      ],
    },
  ],
}

export const SPACES: Half = {
  id: 'spaces',
  label: 'For spaces',
  sub: 'Free to start, Business when you charge',
  heading: 'From an empty Tuesday to a full one.',
  jobs: [
    {
      title: 'Be found',
      line: 'Land where your town looks.',
      photo: 'gathering-04.jpg',
      features: [
        { id: 'f-page', icon: 'page', name: 'Your page', line: 'A page for your Space you change yourself.', tier: 'Free', steps: ['Add your story, photos and hours.', 'Your Circles and events appear automatically.', 'Edit anytime, no designer needed.'], changes: 'People see what you run before they walk in.' },
        { id: 'f-standing', icon: 'standing', name: 'Standing', line: 'Placement earned by gathering, never sold.', tier: 'Free', steps: ['Gather often and check people in.', 'Your standing rises with every meeting.', 'New Spaces get a first boost.'], changes: 'The more you gather, the more you’re found.' },
        { id: 'f-circles-s', icon: 'circle', name: 'Circles', line: 'Your steady place.', tier: 'Free', steps: ['Create a Circle with a time and a door.', 'Run it yourself or with a Host.', 'Members get reminders automatically.'], changes: 'A room that keeps filling itself.' },
        { id: 'f-events-s', icon: 'ticket', name: 'Events', line: 'Post a one-off to the town calendar.', tier: 'Free', steps: ['Add a date, a place and a capacity.', 'Charge for tickets or keep it free.', 'It lands on the calendar your town reads.'], changes: 'A full room for the night you planned.' },
      ],
    },
    {
      title: 'Open the door',
      line: 'Know who came.',
      photo: 'gathering-07.jpg',
      features: [
        { id: 'f-doorqr', icon: 'qr', name: 'Door QR', line: 'One code for every experience you run.', tier: 'Free', steps: ['Print your Space’s QR once.', 'Guests scan it at the door.', 'Every arrival lands in your contacts.'], changes: 'You remember everyone who walked in.' },
        { id: 'f-contacts', icon: 'contacts', name: 'Contacts', line: 'Who came, who’s new, who hasn’t been back.', tier: 'Free', steps: ['Check-ins build your list automatically.', 'See first visits, regulars and drifters.', 'Your list stays yours.'], changes: 'You know your community by name.' },
        { id: 'f-firsttimers', icon: 'nudge', name: 'First-timer nudges', line: 'A heads-up while they’re still in the room.', tier: 'Business', steps: ['A first-timer checks in.', 'You get a nudge with their name.', 'Say hi before they slip out.'], changes: 'More first visits turn into second ones.' },
      ],
    },
    {
      title: 'Bring them back',
      line: 'Give them a rhythm.',
      photo: 'gathering-09.jpg',
      features: [
        { id: 'f-programs-s', icon: 'program', name: 'Programs', line: 'A path your Circle walks together.', tier: 'Business', steps: ['Start from a format or write your own.', 'Set the weeks and the sessions.', 'Members move through it together.'], changes: 'People stay for the whole run.' },
        { id: 'f-email', icon: 'message', name: 'Email + win-back', line: 'Bring back the ones who drifted.', tier: 'Business', steps: ['Pick a group from your contacts.', 'Send an update or a win-back note.', 'See who comes back.'], changes: 'Fewer quiet goodbyes.' },
        { id: 'f-handoff', icon: 'host', name: 'Hosts', line: 'Hand a Circle to a regular.', tier: 'Free', steps: ['Invite a regular to host.', 'They run it under your Space.', 'You see check-ins from every Circle.'], changes: 'You grow without burning out.' },
      ],
    },
    {
      title: 'Get paid',
      line: 'Fair when it pays.',
      photo: 'night-yoga-rave-web.jpg',
      features: [
        { id: 'f-tickets', icon: 'ticket', name: 'Tickets + refunds', line: 'Sell, refund and run the guest list in one place.', tier: 'Free', steps: ['Set a price and a capacity.', 'Guests pay at checkout.', 'Refund in one click if plans change.'], changes: 'No spreadsheet on the night.' },
        { id: 'f-memberships', icon: 'membership', name: 'Memberships', line: 'Recurring support, straight into a Circle.', tier: 'Business', steps: ['Set a monthly price.', 'Members join and land in their Circle.', 'Payouts arrive on schedule.'], changes: 'Steady income from your regulars.' },
        { id: 'f-tips', icon: 'gem', name: 'Tips', line: 'Thanks after a good night, with only card processing taken out.', tier: 'Free', steps: ['Guests tip after checking in.', 'It goes straight to you.', 'No platform fee, only card processing.'], changes: 'Gratitude that pays the rent.' },
      ],
    },
  ],
}

/** How many features a half carries (the jump bar's count pill). */
export const featureCount = (h: Half) => h.jobs.reduce((n, j) => n + j.features.length, 0)
