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
    cp: 'Someone new in town opens the calendar and finds a Circle that meets Thursdays, ten minutes away.',
    ce: 'A studio opens a Space for free. Its page, Circles and events land on the calendar the whole town reads.',
    ap: ['Browse this week', SITE.peopleNear], ae: ['Open your Space', SITE.spaces],
  },
  {
    s: 'Show up', se: 'Open the door',
    p: ['Scans in at the door', 'checkin'], m: ['The door QR', 'qr'], e: ['Sees who came', 'contacts'],
    cp: 'They walk in and scan the Space’s QR code. They’re checked in, and the Zaps land.',
    ce: 'Every scan lands in your contacts. First-timers get flagged, so you can say hi before they leave.',
    ap: ['How check-in works', feature('f-checkin')], ae: ['See Door QR', feature('f-doorqr')],
  },
  {
    s: 'Gather', se: 'Gather',
    p: ['Meets their Circle', 'contacts'], m: ['The Circle', 'circle'], e: ['Runs the Circle', 'breath'],
    cp: 'Same people, same time, around one thing. The phone stays in the bag.',
    ce: 'Run it yourself or with a Host. Reminders go out automatically, so the room fills itself.',
    ap: ['See Circles', feature('f-circles')], ae: ['Start a Circle', feature('f-circles-s')],
  },
  {
    s: 'Come back', se: 'Bring them back',
    p: ['Becomes a regular', 'zap'], m: ['The rhythm', 'program'], e: ['Brings them back', 'nudge'],
    cp: 'Every check-in earns Zaps and fills the Circle’s meter. Seasons reset every 13 weeks, so there’s no streak to protect.',
    ce: 'Programs give your Circle a path to walk together. Win-back emails reach the people who drifted.',
    ap: ['How Zaps work', feature('f-zaps')], ae: ['Build a program', feature('f-programs-s')],
  },
  {
    s: 'Support', se: 'Get paid',
    p: ['Buys a ticket or joins', 'ticket'], m: ['Fair pay', 'membership'], e: ['Gets paid', 'tip'],
    cp: 'Free stays free. When a Space charges, they buy a ticket or a membership, and can tip after a good night.',
    ce: 'Sell tickets, run memberships and take tips in one place. Tips carry no platform fee, only card processing, and payouts arrive on schedule.',
    ap: ['See pricing', SITE.pricing], ae: ['How you get paid', feature('f-tickets')],
  },
  {
    s: 'Pass it on', se: 'Pass it on',
    p: ['Brings a friend, then hosts', 'host'], m: ['The handoff', 'arrow'], e: ['Hands a Circle to a regular', 'standing'],
    cp: 'They send an invite link, and both earn Zaps when the friend checks in. Later, they host a Circle of their own.',
    ce: 'Invite a regular to host under your Space. You see check-ins from every Circle, and your standing rises.',
    ap: ['Host an experience', feature('f-host')], ae: ['How Hosts work', feature('f-handoff')],
  },
]
