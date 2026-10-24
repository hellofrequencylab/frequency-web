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
  /** Spaces only: the plan that carries it. Collective and Network (LIVE-992) are the two plans above
   *  Business; the chip reads the plan name, so a visitor meets them here, not only on /pricing. */
  tier?: 'Free' | 'Business' | 'Collective' | 'Network'
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
  sub: 'Free to join',
  heading: 'Find a community gathering to try.',
  jobs: [
    {
      title: 'Find',
      line: 'See what’s happening near you.',
      photo: 'day-park-yoga.jpg',
      features: [
        { id: 'f-calendar', icon: 'event', name: 'What’s happening', line: 'Browse listed gatherings near you.', steps: ['Set your town once.', 'Browse Circles, events and programs by day.', 'Filter by what you like doing and when you’re free.'], changes: 'Choose a gathering and read the details before you go.' },
        { id: 'f-circles', icon: 'circle', name: 'Circles', line: 'Small groups around something you’d like to do.', steps: ['Pick a Circle that meets at a time you’re free.', 'Show up. Check the listing for arrival details.', 'Check the Circle’s schedule for its next gathering.'], changes: 'A regular time and place to meet.' },
        { id: 'f-events', icon: 'ticket', name: 'Events', line: 'One-off gatherings worth going out for.', steps: ['RSVP, or buy a ticket if the Space charges.', 'Choose event notifications in your settings.', 'Walk in with your ticket on your phone.'], changes: 'Read the date, place and arrival details before you go.' },
        { id: 'f-programs', icon: 'program', name: 'Programs', line: 'A few weeks with the same group, start to finish.', steps: ['Join before the first week.', 'Move through each session together.', 'Follow the program’s sessions and completion requirements.'], changes: 'See the sessions laid out from start to finish.' },
      ],
    },
    {
      title: 'Show up',
      line: 'Walk in. You’re counted.',
      photo: 'day-parachute-play.jpg',
      features: [
        { id: 'f-checkin', icon: 'checkin', name: 'Check-in', line: 'Scan an eligible code to check in.', steps: ['Open your phone camera at the door.', 'Scan the Space’s QR code.', 'Follow the check-in confirmation on your screen.'], changes: 'A record of your check-in.' },
        { id: 'f-reminders', icon: 'nudge', name: 'Reminders', line: 'A nudge before your Circle or event.', steps: ['RSVP or join a Circle.', 'Choose event notifications in your settings.', 'Open your RSVP to update your plans.'], changes: 'Keep the date and time handy.' },
      ],
    },
    {
      title: 'Come back',
      line: 'Same people, same time.',
      photo: 'day-meditation-circle.jpg',
      features: [
        { id: 'f-zaps', icon: 'zap', name: 'Zaps', line: 'Points for eligible participation, practice and outreach.', steps: ['Check in at a gathering.', 'Finish something with your Circle.', 'Bring a friend to their first one.'], changes: 'Showing up becomes the game.' },
        { id: 'f-seasons', icon: 'event', name: 'Seasons', line: 'Follow the current season’s dates and activity.', steps: ['Check the current season’s start and end dates.', 'Your season Zaps contribute to your rank.', 'Seasonal counters reset when the season rolls over.'], changes: 'Follow the season at your own pace.' },
        { id: 'f-meter', icon: 'circle', name: 'Circle meter', line: 'Track your Circle’s shared participation.', steps: ['See participation recorded for your Circle.', 'Open the Circle’s board to see its shared activity.', 'See your Circle’s shared progress on its meter.'], changes: 'See the progress your Circle shares.' },
        { id: 'f-membership-p', icon: 'membership', name: 'Memberships', line: 'Join a Space with a recurring membership.', steps: ['Pick a Space you keep going back to.', 'Join their membership.', 'Check the tier’s listed benefits and any linked Circle access.'], changes: 'See the membership you’ve joined and its benefits.' },
      ],
    },
    {
      title: 'Pass it on',
      line: 'Bring someone. Then host.',
      photo: 'day-beach-hoop.jpg',
      features: [
        { id: 'f-invites', icon: 'message', name: 'Invites', line: 'Share an invitation with a friend.', steps: ['Send an invite link anyone can open.', 'Eligible public events offer an email RSVP without an account.', 'Eligible referrals can earn Zaps under the referral rules.'], changes: 'The best nights get passed along.' },
        { id: 'f-host', icon: 'host', name: 'Host an experience', line: 'Your living room, garden or park counts.', steps: ['Pick a Starter Circle format.', 'Share your invite link.', 'Check people in at your door.'], changes: 'Invite people to a gathering of your own.' },
      ],
    },
  ],
}

export const SPACES: Half = {
  id: 'spaces',
  label: 'For spaces',
  sub: 'Free to start, Business when you charge',
  heading: 'Make a place for your next gathering.',
  jobs: [
    {
      title: 'Be found',
      line: 'Share your next date on the local calendar.',
      photo: 'gathering-04.jpg',
      features: [
        { id: 'f-page', icon: 'page', name: 'Your page', line: 'A page for your Space you change yourself.', tier: 'Free', steps: ['Add your story, photos and hours.', 'Show the Circles and events linked to your Space.', 'Edit anytime, no designer needed.'], changes: 'People see what you run before they walk in.' },
        { id: 'f-standing', icon: 'standing', name: 'Standing', line: 'Placement earned by gathering, never sold.', tier: 'Free', steps: ['Gather often and check people in.', 'Standing reflects how your Space gathers.', 'Review your Standing and its contributing activity.'], changes: 'See how Standing reflects participation in your Space.' },
        { id: 'f-circles-s', icon: 'circle', name: 'Circles', line: 'Your steady place.', tier: 'Free', steps: ['Create a Circle with a time and a door.', 'Run it yourself or with a Host.', 'Members choose their event notification settings.'], changes: 'Give your Circle a regular time to meet.' },
        { id: 'f-events-s', icon: 'ticket', name: 'Events', line: 'Post a one-off to the town calendar.', tier: 'Free', steps: ['Add a date, a place and a capacity.', 'Keep it free, or choose Business to sell tickets.', 'It appears on the local calendar.'], changes: 'Share the details people need to take part.' },
      ],
    },
    {
      title: 'Open the door',
      line: 'Know who came.',
      photo: 'gathering-07.jpg',
      features: [
        { id: 'f-doorqr', icon: 'qr', name: 'Door QR', line: 'One code for every experience you run.', tier: 'Free', steps: ['Print your Space’s QR once.', 'Guests scan it at the door.', 'Check-ins appear in your contacts.'], changes: 'Look back at who checked in.' },
        { id: 'f-contacts', icon: 'contacts', name: 'Contacts', line: 'Who came, who’s new, who hasn’t been back.', tier: 'Free', steps: ['Check-ins build your list automatically.', 'See first visits, regulars and people who haven’t returned recently.', 'Manage the contacts associated with your Space.'], changes: 'Find the names of people who checked in.' },
        { id: 'f-firsttimers', icon: 'nudge', name: 'First-timer nudges', line: 'See a first-timer notification after an eligible check-in.', tier: 'Business', steps: ['A first-timer checks in.', 'Check your notifications for their name.', 'Use their name when you welcome them.'], changes: 'Welcome a first-timer by name.' },
      ],
    },
    {
      title: 'Bring them back',
      line: 'Give them a rhythm.',
      photo: 'gathering-09.jpg',
      features: [
        { id: 'f-programs-s', icon: 'program', name: 'Programs', line: 'A path your Circle walks together.', tier: 'Business', steps: ['Start from a format or write your own.', 'Set the weeks and the sessions.', 'Members move through it together.'], changes: 'Set out the sessions people can follow together.' },
        { id: 'f-email', icon: 'message', name: 'Email + win-back', line: 'Invite people who have not been in a while.', tier: 'Business', steps: ['Pick a group from your contacts.', 'Send an update or a win-back note.', 'Share a date or a note about what is next.'], changes: 'Keep a way to send another invitation.' },
        { id: 'f-handoff', icon: 'host', name: 'Hosts', line: 'Hand a Circle to a regular.', tier: 'Free', steps: ['Invite a regular to host.', 'They run it under your Space.', 'You see check-ins from every Circle.'], changes: 'Share the hosting with someone you know.' },
      ],
    },
    {
      title: 'Get paid',
      line: 'Fair when it pays.',
      photo: 'night-yoga-rave-web.jpg',
      features: [
        { id: 'f-tickets', icon: 'ticket', name: 'Tickets + refunds', line: 'Sell tickets on Business and manage your guest list.', tier: 'Business', steps: ['On Business, set a ticket price and a capacity.', 'Guests pay at checkout.', 'Review the order and refund controls if plans change.'], changes: 'No spreadsheet on the night.' },
        { id: 'f-memberships', icon: 'membership', name: 'Memberships', line: 'Recurring support with the benefits you set.', tier: 'Business', steps: ['Set a monthly price.', 'Link a Circle if you want the tier to include access, subject to capacity.', 'Manage payouts through your connected account.'], changes: 'Offer a recurring way to support your Space.' },
        { id: 'f-tips', icon: 'gem', name: 'Tips', line: 'Thanks after a good night, with only card processing taken out.', tier: 'Free', steps: ['Guests tip after checking in.', 'Stripe manages payouts to your connected account.', 'No platform fee, only card processing.'], changes: 'Give guests a way to leave a tip.' },
      ],
    },
    {
      title: 'Grow together',
      line: 'More than one group, one network.',
      photo: 'gathering-04.jpg',
      features: [
        { id: 'f-partners', icon: 'host', name: 'Partner hub', line: 'Separate groups that work together, each keeping its own members and payouts.', tier: 'Collective', steps: ['Invite the Spaces you partner with.', 'Share one calendar and cross-list each other’s Circles and Journeys.', 'Each partner keeps its own members, contacts and payouts.'], changes: 'Your groups show up as one scene without merging into one business.' },
        { id: 'f-chapters', icon: 'space', name: 'Chapters', line: 'One organization, every chapter under one home.', tier: 'Network', steps: ['Add each chapter as its own Space.', 'Configure membership sharing and central administration across chapters.', 'A roll-up report shows the whole network.'], changes: 'Give each chapter its own tools and keep a view across the network.' },
      ],
    },
  ],
}

/** How many features a half carries (the jump bar's count pill). */
export const featureCount = (h: Half) => h.jobs.reduce((n, j) => n + j.features.length, 0)
