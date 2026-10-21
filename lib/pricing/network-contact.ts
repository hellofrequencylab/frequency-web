// The two Network conversations, as mailto links. A leaf (one import) so /pricing and /networks quote the
// same door and neither pulls the other's page component to get it.
import { CONTACT_EMAIL } from '@/lib/site'

/** The conversation link while Network is quote only. */
export const NETWORK_CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Frequency Network')}`

/** The Independent Network conversation: a sales call, never checkout. */
export const INDEPENDENT_CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Frequency Independent Network')}&body=${encodeURIComponent('How many chapters do you run?\nHow many members do you have today?\nDo you need your own domain or app?\nDo you need us to move members and data from another platform?')}`
