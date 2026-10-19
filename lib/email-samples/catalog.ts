// THE STOCK EMAIL CATALOG (EMAIL-026). One list of every stock template Frequency sends, each rendered with
// fixture data to a send-ready payload, so the whole set can be read in one place, pinned by one test
// (lib/email-samples/catalog.test.ts) and mailed to an inbox in one command (scripts/email-samples.mjs,
// the owner's 2026-10-19 ask: "send every stock template to danieltyack@gmail.com").
//
// A spec either returns the payload (a pure builder) or calls the real sender, whose enqueueEmail the test
// intercepts (the outbox is mocked there), so a transactional sender's own subject, html and text are what
// ships as the sample. Nothing here is imported by app code: it is a reading of the senders, not a path.
// Voice canon: fixture copy carries no em dashes.

import type { EmailPayload } from '@/lib/email'
import {
  buildBookingReminderEmail,
  buildHousingMatchEmail,
  buildPlanShareEmail,
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail,
  sendDispatchNotificationEmail,
  sendEventCancelledEmail,
  sendEventClaimInviteEmail,
  sendEventReminderEmail,
  sendEventRsvpConfirmationEmail,
  sendEventUpdateEmail,
  sendGuestBookingConfirmEmail,
  sendGuestEventCancelledEmail,
  sendGuestEventReminderEmail,
  sendGuestEventUpdateEmail,
  sendGuestRsvpConfirmationEmail,
  sendGuestTicketEmail,
  sendInviteEmail,
  sendMadeItEmail,
  sendMemberTicketEmail,
  sendOptinConfirmEmail,
  sendOptinWelcomeEmail,
  sendOutreachNoteEmail,
  sendScanIntroEmail,
  sendSignupRecoveryEmail,
  sendSpaceFollowerEventReminderEmail,
  sendThisWeekEmail,
  sendWeeklyDigestEmail,
  sendWelcomeEmail,
} from '@/lib/email'
import { receiptHtml, receiptText, type ReceiptContent } from '@/lib/billing/receipt-email'
import { compileEmailDoc, plainTextEmail } from '@/lib/email-studio/shell'
import { DEFAULT_EMAIL_COLORS } from '@/lib/email-studio/render'
import { renderCampaignHtml } from '@/lib/spaces/campaign-html'
import { renderReplyEmail, renderCoalescedEmail, bodyToHtml } from '@/lib/comms/email-template'
import { conversationFrom } from '@/lib/comms/from-address'
import { spaceFromLine } from '@/lib/spaces/email'
import { envString } from '@/lib/env/string'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

/** Who the email comes from in production, so a sample lands with the real From header:
 *  - `system`: the platform sender, EMAIL_FROM (`Frequency <noreply@send.frequencylocal.com>`).
 *  - `space-campaign`: a Space's campaign or drip. The Space's name masks the shared verified address
 *    (lib/spaces/email.ts spaceFromLine); a paid Space with a verified domain sends from its own identity
 *    instead (resolveSpaceEmailDefaultIdentity), which no fixture can show.
 *  - `space-conversation`: a Space's CRM reply. The Space's name over the conversational address
 *    (lib/comms/from-address.ts conversationFrom, EMAIL_CONVERSATION_FROM), or the Space's verified inbox
 *    address `hello@<slug>.<root>` when it has one. */
type SampleSender = 'system' | 'space-campaign' | 'space-conversation'

export interface SampleSpec {
  /** Stable id, also the filename stem when the catalog is written out. */
  id: string
  /** The family the template belongs to, for the index and the sample subject. */
  group: 'Welcome and sign-up' | 'Events' | 'Tickets and bookings' | 'Digests' | 'Money' | 'Spaces and campaigns' | 'Conversations' | 'Community'
  /** Which production sender the template goes out as (default `system`). */
  sender?: SampleSender
  /** Returns the payload, or calls a sender whose enqueueEmail the test captures (then returns nothing). */
  run: () => Promise<EmailPayload | void> | EmailPayload | void
}

const SAMPLE_SPACE_NAME = 'North Light Yoga'

/** The production From header for a sample, from the same helpers the senders use. */
export function sampleFrom(sender: SampleSender = 'system'): string {
  const platform = envString('EMAIL_FROM', 'Frequency <noreply@send.frequencylocal.com>')
  if (sender === 'space-campaign') return spaceFromLine(SAMPLE_SPACE_NAME, platform)
  if (sender === 'space-conversation') return conversationFrom(SAMPLE_SPACE_NAME, { via: false })
  return platform
}

const SITE = 'https://frequencylocal.com'
const TO = 'sample@frequencylocal.com'
const PROFILE = '00000000-0000-4000-8000-000000000001'
const EVENT_URL = `${SITE}/events/sunrise-sound-bath`
const WHEN = 'Saturday, November 7, 9:00 AM PT'
const WHEN_LABEL = 'tomorrow at 9:00 AM'

const ORDER_RECEIPT: ReceiptContent = {
  greetingName: 'Maya',
  lead: 'Your order from North Light Yoga is paid, $45 in total.',
  lines: [
    { label: 'Order', value: '5 class pass' },
    { label: 'Total', value: '$45' },
    { label: 'Seller', value: 'North Light Yoga' },
    { label: 'Date', value: 'October 19, 2026' },
  ],
  closing: ['North Light Yoga can see the order now and will send it on.', 'My orders keeps every purchase you make on Frequency, with the seller and the total.'],
  actionLabel: 'See my orders',
  actionUrl: `${SITE}/orders`,
}

const DONATION_RECEIPT: ReceiptContent = {
  greetingName: null,
  lead: 'Thank you for giving $25 to Tidepool Trust.',
  lines: [{ label: 'Amount', value: '$25' }, { label: 'Date', value: 'October 19, 2026' }],
  closing: ['Keep this email for your records.'],
  madeWith: { label: 'Made with Frequency', url: SITE },
}

/** A block email that places one of every palette block, including the three data cards (EMAIL-025). */
const SHOWCASE_LAYOUT: EntityLayout = {
  rows: [
    { id: 'r0', columns: 1, cells: [['photoHero']] },
    { id: 'r1', columns: 1, cells: [['displayHeading']] },
    { id: 'r2', columns: 1, cells: [['prose']] },
    { id: 'r3', columns: 1, cells: [['eventCard']] },
    { id: 'r4', columns: 1, cells: [['circleCard']] },
    { id: 'r5', columns: 1, cells: [['productCard']] },
    { id: 'r6', columns: 1, cells: [['editorial']] },
    { id: 'r7', columns: 1, cells: [['cardGrid']] },
    { id: 'r8', columns: 1, cells: [['callout']] },
    { id: 'r9', columns: 1, cells: [['quote']] },
    { id: 'r10', columns: 1, cells: [['divider']] },
    { id: 'r11', columns: 1, cells: [['heading']] },
    { id: 'r12', columns: 1, cells: [['text']] },
    { id: 'r13', columns: 1, cells: [['image']] },
    { id: 'r14', columns: 1, cells: [['button']] },
  ],
  content: {
    photoHero: { eyebrow: 'This month at North Light', title: 'The season turns, and so does the schedule', subtitle: 'Sunrise sessions are back, three mornings a week.', image: `${SITE}/og/default.png`, alt: 'A sunrise over the water' },
    displayHeading: { text: 'Hello, neighbor' },
    prose: { text: 'Here is what is happening around the studio this month. Every block below is one the editor offers, so you can see how a full email reads.' },
    eventCard: { event: { id: 'sample-event' }, title: 'Sunrise sound bath', when: WHEN, where: 'Moonlight Beach, Encinitas', image: `${SITE}/og/default.png`, url: EVENT_URL, ctaLabel: 'RSVP' },
    circleCard: { circle: { id: 'sample-circle' }, title: 'Dawn swimmers', blurb: 'We swim at first light, every week, rain or shine, and then coffee after on the sand.', url: `${SITE}/circles/dawn-swimmers`, ctaLabel: 'Join the circle' },
    productCard: { product: { id: 'sample-product' }, title: 'Cedar candle', price: '$24', image: `${SITE}/og/default.png`, url: `${SITE}/market/sample-product`, ctaLabel: 'Shop this' },
    editorial: { eyebrow: 'From the host', title: 'Why we start at dawn', body: 'The water is glass, the beach is empty, and the day has not asked anything of you yet. That is the whole idea.' },
    cardGrid: { eyebrow: 'Coming up', title: 'Three ways in', cards: [{ title: 'Beginner mornings', text: 'Tuesdays, no gear needed.' }, { title: 'Open water', text: 'Saturdays for the steady swimmers.' }] },
    callout: { title: 'Bring a friend in November', body: 'First visit is on us. Forward this and they can RSVP straight from the card.', buttonLabel: 'Share the invite', buttonUrl: EVENT_URL },
    quote: { text: 'I came for the swim and stayed for the people.', by: 'Jordan, member since spring' },
    divider: {},
    heading: { text: 'One more thing' },
    text: { text: 'Reply to this email and it lands in the studio inbox. A real person reads it.' },
    image: { src: `${SITE}/og/default.png`, alt: 'The studio at first light' },
    button: { label: 'See the full calendar', url: `${SITE}/spaces/north-light/events` },
  },
}

const SPACE_BRAND = {
  wordmark: 'North Light Yoga',
  address: 'North Light Yoga, 123 Coast Hwy, Encinitas, CA 92024',
  colors: { ...DEFAULT_EMAIL_COLORS },
}

const REPLY_BRAND = { name: 'North Light Yoga', logoUrl: null, accent: null, url: `${SITE}/spaces/north-light` }

export const SAMPLE_SPECS: readonly SampleSpec[] = [
  // ── Welcome and sign-up ──────────────────────────────────────────────────────────────────────────────
  { id: 'welcome', group: 'Welcome and sign-up', run: () => sendWelcomeEmail({ to: TO, displayName: 'Maya', inviterName: 'Jordan' }) },
  { id: 'invite', group: 'Welcome and sign-up', run: () => sendInviteEmail({ to: TO, inviterName: 'Jordan', contextName: 'Dawn swimmers', contextKind: 'circle', inviteUrl: `${SITE}/join/abc123` }) },
  { id: 'scan-intro', group: 'Welcome and sign-up', run: () => sendScanIntroEmail({ to: TO, recipientName: 'Maya', inviterName: 'Jordan', joinUrl: `${SITE}/join/abc123`, unsubscribeUrl: `${SITE}/unsubscribe/t` }) },
  { id: 'signup-recovery', group: 'Welcome and sign-up', run: () => sendSignupRecoveryEmail({ to: TO, firstName: 'Maya', resumeUrl: `${SITE}/sign-up?resume=abc123` }) },
  { id: 'optin-confirm', group: 'Welcome and sign-up', run: () => sendOptinConfirmEmail({ to: TO, confirmUrl: `${SITE}/confirm/abc123`, firstName: 'Maya' }) },
  { id: 'optin-welcome', group: 'Welcome and sign-up', run: () => sendOptinWelcomeEmail({ to: TO, firstName: 'Maya', unsubscribeUrl: `${SITE}/unsubscribe/t` }) },

  // ── Events ───────────────────────────────────────────────────────────────────────────────────────────
  { id: 'event-rsvp-confirmation', group: 'Events', run: () => sendEventRsvpConfirmationEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', hostName: 'Jordan', circleName: 'Dawn swimmers', eventUrl: EVENT_URL, icsUrl: `${EVENT_URL}.ics`, googleCalUrl: 'https://calendar.google.com/calendar/r/eventedit?text=Sunrise+sound+bath', status: 'going' }) },
  { id: 'event-rsvp-waitlist', group: 'Events', run: () => sendEventRsvpConfirmationEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', hostName: 'Jordan', circleName: null, eventUrl: EVENT_URL, icsUrl: null, googleCalUrl: null, status: 'waitlist' }) },
  { id: 'guest-rsvp-confirmation', group: 'Events', run: () => sendGuestRsvpConfirmationEmail({ to: TO, guestName: 'Maya', eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', hostName: 'Jordan', circleName: 'Dawn swimmers', eventUrl: EVENT_URL, icsUrl: `${EVENT_URL}.ics`, googleCalUrl: null, signUpUrl: `${SITE}/sign-up`, seatUrl: `${EVENT_URL}/seat/abc123`, status: 'going' }) },
  { id: 'event-reminder-24h', group: 'Events', run: () => sendEventReminderEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', whenLabel: WHEN_LABEL, whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', eventUrl: EVENT_URL, lead: '24h' }) },
  { id: 'event-reminder-2h', group: 'Events', run: () => sendEventReminderEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', whenLabel: 'in two hours', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', eventUrl: EVENT_URL, lead: '2h' }) },
  { id: 'space-follower-event-reminder', group: 'Events', run: () => sendSpaceFollowerEventReminderEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, spaceName: 'North Light Yoga', eventTitle: 'Sunrise sound bath', whenLabel: WHEN_LABEL, whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', eventUrl: EVENT_URL }) },
  { id: 'guest-event-reminder', group: 'Events', run: () => sendGuestEventReminderEmail({ to: TO, guestName: 'Maya', eventTitle: 'Sunrise sound bath', whenLabel: WHEN_LABEL, whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', eventUrl: EVENT_URL, held: 'rsvp', claimUrl: `${SITE}/claim/abc123` }) },
  { id: 'event-update', group: 'Events', run: () => sendEventUpdateEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', updateTitle: 'We moved to the north end', body: 'The south lot is closed for repaving, so meet us by the lifeguard tower at the north end. Same time.', eventUrl: EVENT_URL }) },
  { id: 'guest-event-update', group: 'Events', run: () => sendGuestEventUpdateEmail({ to: TO, eventTitle: 'Sunrise sound bath', updateTitle: 'We moved to the north end', body: 'The south lot is closed for repaving, so meet us by the lifeguard tower at the north end. Same time.', eventUrl: EVENT_URL }) },
  { id: 'event-cancelled', group: 'Events', run: () => sendEventCancelledEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, eventUrl: EVENT_URL, refunded: true }) },
  { id: 'guest-event-cancelled', group: 'Events', run: () => sendGuestEventCancelledEmail({ to: TO, guestName: 'Maya', eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, eventUrl: EVENT_URL, refunded: false }) },
  { id: 'made-it', group: 'Events', run: () => sendMadeItEmail({ to: TO, name: 'Maya', eventTitle: 'Sunrise sound bath', eventUrl: EVENT_URL, madeItUrl: `${EVENT_URL}/made-it`, next: { title: 'Full moon swim', whenAbsolute: 'Friday, November 20, 6:30 PM PT', url: `${SITE}/events/full-moon-swim`, shareUrl: `${SITE}/events/full-moon-swim?share=1` }, joinUrl: `${SITE}/sign-up`, unsubscribeUrl: `${SITE}/unsubscribe/t`, dedupeKey: 'sample' }) },
  { id: 'event-claim-invite', group: 'Events', run: () => sendEventClaimInviteEmail({ to: TO, organizerName: 'Jordan', posterName: 'Jordan', eventTitle: 'Sunrise sound bath', whenLine: WHEN, location: 'Moonlight Beach, Encinitas', claimUrl: `${SITE}/claim/abc123`, eventUrl: EVENT_URL }) },

  // ── Tickets and bookings ─────────────────────────────────────────────────────────────────────────────
  { id: 'member-ticket', group: 'Tickets and bookings', run: () => sendMemberTicketEmail({ to: TO, recipientName: 'Maya', eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', addressHidden: false, hostName: 'Jordan', circleName: 'Dawn swimmers', eventUrl: EVENT_URL, qty: 2, tierName: 'General', amountLabel: '$30', icsUrl: `${EVENT_URL}.ics`, googleCalUrl: null }) },
  { id: 'guest-ticket', group: 'Tickets and bookings', run: () => sendGuestTicketEmail({ to: TO, eventTitle: 'Sunrise sound bath', whenAbsolute: WHEN, location: 'Moonlight Beach, Encinitas', hostName: 'Jordan', circleName: null, eventUrl: EVENT_URL, qty: 1, amountLabel: '$15', claimUrl: `${SITE}/claim/abc123` }) },
  { id: 'booking-confirmation-member', group: 'Tickets and bookings', run: () => sendBookingConfirmationEmail({ to: TO, recipientName: 'Maya', audience: 'member', spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: WHEN, durationMinutes: 60, otherPartyName: 'Jordan', manageUrl: `${SITE}/bookings/abc123`, icsBase64: null, madeWith: { label: 'Made with Frequency', url: SITE } }) },
  { id: 'booking-confirmation-owner', group: 'Tickets and bookings', run: () => sendBookingConfirmationEmail({ to: TO, recipientName: 'Jordan', audience: 'owner', spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: WHEN, durationMinutes: 60, otherPartyName: 'Maya', manageUrl: `${SITE}/spaces/north-light/bookings/abc123`, icsBase64: null }) },
  { id: 'guest-booking-confirm', group: 'Tickets and bookings', run: () => sendGuestBookingConfirmEmail({ to: TO, guestName: 'Maya', spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: WHEN, durationMinutes: 60, confirmUrl: `${SITE}/bookings/confirm/abc123`, holdMinutes: 30 }) },
  { id: 'booking-reminder', group: 'Tickets and bookings', run: () => buildBookingReminderEmail({ to: TO, recipientName: 'Maya', spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: WHEN, manageUrl: `${SITE}/bookings/abc123` }) },
  { id: 'booking-cancelled', group: 'Tickets and bookings', run: () => sendBookingCancelledEmail({ to: TO, recipientName: 'Maya', audience: 'member', spaceName: 'North Light Yoga', serviceName: 'Private session', whenAbsolute: WHEN, reason: 'Jordan is out sick this week.', bookUrl: `${SITE}/spaces/north-light/book` }) },

  // ── Digests ──────────────────────────────────────────────────────────────────────────────────────────
  { id: 'weekly-digest', group: 'Digests', run: () => sendWeeklyDigestEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, dispatches: [{ title: 'Notes from the water', excerpt: 'Three mornings, one tide chart, and a new favorite spot.', url: `${SITE}/dispatches/notes-from-the-water`, authorName: 'Jordan' }], upcomingEvents: [{ title: 'Sunrise sound bath', startsAt: '2026-11-07T17:00:00Z', location: 'Moonlight Beach, Encinitas', url: EVENT_URL }], topStreak: { type: 'swim', count: 4 }, rank: { name: 'Regular', zaps: 120 }, goAgain: [{ title: 'Full moon swim', url: `${SITE}/events/full-moon-swim` }], nearbyEvents: [{ title: 'Tide pool walk', startsAt: '2026-11-08T16:00:00Z', location: 'Swami\'s, Encinitas', url: `${SITE}/events/tide-pool-walk` }] }) },
  { id: 'this-week', group: 'Digests', run: () => sendThisWeekEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, regionName: 'North County San Diego', events: [{ id: 'e1', title: 'Sunrise sound bath', startsAt: '2026-11-07T17:00:00Z', timeZone: 'America/Los_Angeles', where: 'Moonlight Beach, Encinitas', url: EVENT_URL }, { id: 'e2', title: 'Tide pool walk', startsAt: '2026-11-08T16:00:00Z', timeZone: 'America/Los_Angeles', where: 'Swami\'s, Encinitas', url: `${SITE}/events/tide-pool-walk` }], dedupeKey: 'sample' }) },

  // ── Money ────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'receipt-order', group: 'Money', run: async () => ({ to: TO, subject: 'Your order from North Light Yoga', html: await receiptHtml(ORDER_RECEIPT), text: receiptText(ORDER_RECEIPT) }) },
  { id: 'receipt-donation', group: 'Money', run: async () => ({ to: TO, subject: 'Thank you for giving to Tidepool Trust', html: await receiptHtml(DONATION_RECEIPT), text: receiptText(DONATION_RECEIPT) }) },

  // ── Spaces and campaigns ─────────────────────────────────────────────────────────────────────────────
  { id: 'block-campaign-showcase', group: 'Spaces and campaigns', sender: 'space-campaign', run: () => {
    const out = compileEmailDoc({ layout: SHOWCASE_LAYOUT, subject: 'Every block in one email', preheader: 'The full palette, including the live Event, Circle and Product cards.' }, { brand: SPACE_BRAND, unsubscribeUrl: `${SITE}/unsubscribe/s`, manageUrl: `${SITE}/manage-emails`, sentWithFrequency: true })
    return { to: TO, subject: out.subject, html: out.html, text: out.text }
  } },
  { id: 'block-campaign-frequency', group: 'Spaces and campaigns', run: () => {
    const out = compileEmailDoc({ layout: SHOWCASE_LAYOUT, subject: 'Every block, in the Frequency shell', preheader: 'The same email as Frequency sends it.' }, { unsubscribeUrl: `${SITE}/unsubscribe/t`, manageUrl: `${SITE}/manage-emails` })
    return { to: TO, subject: out.subject, html: out.html, text: out.text }
  } },
  { id: 'plain-campaign-space', group: 'Spaces and campaigns', sender: 'space-campaign', run: () => ({ to: TO, subject: 'Sunrise sessions are back', html: renderCampaignHtml('Hi there,\n\nSunrise sessions are back three mornings a week starting Tuesday. Bring a towel and a friend.\n\nSee you at the water,\nJordan', { brand: SPACE_BRAND, sentWithFrequency: true }), text: 'Sunrise sessions are back three mornings a week starting Tuesday.' }) },
  { id: 'plain-campaign-frequency', group: 'Spaces and campaigns', run: () => { const out = plainTextEmail('Hi Maya,\n\nA few things are new this month: the calendar now shows your circles first, and every event page has a Made it button.\n\nThe Frequency team', { unsubscribeUrl: `${SITE}/unsubscribe/t`, manageUrl: `${SITE}/manage-emails`, audienceLine: 'You are receiving this as a Frequency member.' }); return { to: TO, subject: 'New this month on Frequency', html: out.html, text: out.text } } },

  // ── Conversations ────────────────────────────────────────────────────────────────────────────────────
  { id: 'conversation-reply-space', group: 'Conversations', sender: 'space-conversation', run: () => { const out = renderReplyEmail('Thanks for asking. Yes, the Tuesday session is beginner friendly, and the water is warmer than it looks.', 'Jordan\nNorth Light Yoga', REPLY_BRAND); return { to: TO, subject: 'Re: Is Tuesday OK for a beginner?', html: out.html, text: out.text } } },
  { id: 'conversation-reply-frequency', group: 'Conversations', run: () => { const out = renderReplyEmail('Thanks for writing in. Your account is set and the invite went out this morning.', 'The Frequency team', null); return { to: TO, subject: 'Re: Invite not received', html: out.html, text: out.text } } },
  { id: 'conversation-coalesced', group: 'Conversations', sender: 'space-conversation', run: () => { const text = 'Two new replies in your conversation with Maya.\n\nMaya: Is there parking at the north end?\nMaya: Never mind, found it.'; const out = renderCoalescedEmail(text, bodyToHtml(text), 'Jordan\nNorth Light Yoga', REPLY_BRAND); return { to: TO, subject: 'New replies from Maya', html: out.html, text: out.text } } },

  // ── Community ────────────────────────────────────────────────────────────────────────────────────────
  { id: 'dispatch-notification', group: 'Community', run: () => sendDispatchNotificationEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, authorName: 'Jordan', dispatchTitle: 'Notes from the water', excerpt: 'Three mornings, one tide chart, and a new favorite spot.', dispatchUrl: `${SITE}/dispatches/notes-from-the-water` }) },
  { id: 'outreach-note', group: 'Community', run: () => sendOutreachNoteEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, authorName: 'Jordan', body: 'We missed you at the last two swims. The water is warm and the group asked about you. Come Tuesday?' }) },
  { id: 'housing-match', group: 'Community', run: () => buildHousingMatchEmail({ to: TO, recipientName: 'Maya', recipientProfileId: PROFILE, counterpartName: 'Sam', kind: 'listing', city: 'Encinitas', matchPath: '/housing/matches/abc123' }) },
  { id: 'plan-share-requested', group: 'Community', run: () => buildPlanShareEmail({ to: TO, recipientName: 'Jordan', recipientProfileId: PROFILE, moment: 'requested', otherSpaceName: 'Tidepool Trust', planTitle: 'Winter beach cleanups', calendarPath: '/spaces/north-light/settings/calendar' }) },
]
