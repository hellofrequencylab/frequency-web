// THE WEAVE (Home §05 "How it weaves"): the `W` array from templates/website/Home.html's inline script,
// verbatim, with its links pointed at this app's routes. Six stages, each told three ways: the People row
// (p), the shared moment in the middle (m) and the Spaces row (e). The README's porting note applies: the
// six stages map to the Features page's four People jobs and four Spaces jobs, so keep the two in step.

import type { FqIconName } from '@/components/frequency/icon'
import { feature, SITE } from '../shared/links'

export interface WeaveStage {
  /** Stage name on the People side, and on the Spaces side. */
  s: string
  se: string
  p: [string, FqIconName]
  m: [string, FqIconName]
  e: [string, FqIconName]
  /** The caption, People side then Spaces side. */
  cp: string
  ce: string
  /** The caption's button, per side: [label, href]. */
  ap: [string, string]
  ae: [string, string]
}

export const WEAVE: WeaveStage[] = [
  {
    s: 'Find', se: 'Be found',
    p: ['Picks a Circle nearby', 'pin'], m: ['The town calendar', 'event'], e: ['Opens a Space, free', 'space'],
    cp: 'Someone new in town opens the calendar to look for a Circle around something they like doing.',
    ce: 'A studio opens a Space for free. Its page, Circles and events appear on the local calendar.',
    ap: ['Browse this week', SITE.peopleNear], ae: ['Open your Space', SITE.spaces],
  },
  {
    s: 'Show up', se: 'Open the door',
    p: ['Scans in at the door', 'checkin'], m: ['The door QR', 'qr'], e: ['Sees who came', 'contacts'],
    cp: 'They scan the Space’s QR code when they arrive to check in and earn Zaps.',
    ce: 'Use check-in records to see who came and welcome first-timers by name.',
    ap: ['How check-in works', feature('f-checkin')], ae: ['See Door QR', feature('f-doorqr')],
  },
  {
    s: 'Gather', se: 'Gather',
    p: ['Meets their Circle', 'contacts'], m: ['The Circle', 'circle'], e: ['Runs the Circle', 'breath'],
    cp: 'A Circle has a regular time to meet around something people like doing.',
    ce: 'Run it yourself or with a Host. Send reminders so people have the time and place before you meet.',
    ap: ['See Circles', feature('f-circles')], ae: ['Start a Circle', feature('f-circles-s')],
  },
  {
    s: 'Come back', se: 'Bring them back',
    p: ['Becomes a regular', 'zap'], m: ['The rhythm', 'program'], e: ['Brings them back', 'nudge'],
    cp: 'Check in when you meet. You can follow your Circle’s activity through the season.',
    ce: 'Programs give your Circle a path to walk together. Send an invitation to people who have not been in a while.',
    ap: ['How Zaps work', feature('f-zaps')], ae: ['Build a program', feature('f-programs-s')],
  },
  {
    s: 'Support', se: 'Get paid',
    p: ['Buys a ticket or joins', 'ticket'], m: ['Fair pay', 'membership'], e: ['Gets paid', 'tip'],
    cp: 'Free stays free. When a Space charges, they buy a ticket or a membership, and can tip after a good night.',
    ce: 'Sell tickets, run memberships and take tips in one place. Tips carry no platform fee, only card processing, with payouts managed through your connected account.',
    ap: ['See pricing', SITE.pricing], ae: ['How you get paid', feature('f-tickets')],
  },
  {
    s: 'Pass it on', se: 'Pass it on',
    p: ['Brings a friend, then hosts', 'host'], m: ['The handoff', 'arrow'], e: ['Hands a Circle to a regular', 'standing'],
    cp: 'They send an invite link to a friend. If they want to host, they can start a Circle of their own.',
    ce: 'Invite a regular to host under your Space. You can see check-ins from the Circles in your Space.',
    ap: ['Host an experience', feature('f-host')], ae: ['How Hosts work', feature('f-handoff')],
  },
]
