// The Independent Network conversation, as a mailto link. A leaf (one import) so both pricing surfaces quote
// the same door. The quote-only Network link went with /networks (merged into /for/networks, LIVE-2103).
import { CONTACT_EMAIL } from '@/lib/site'

/** The Independent Network conversation: a sales call, never checkout. */
export const INDEPENDENT_CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Frequency Independent Network')}&body=${encodeURIComponent('How many chapters do you run?\nHow many members do you have today?\nDo you need your own domain or app?\nDo you need us to move members and data from another platform?')}`
