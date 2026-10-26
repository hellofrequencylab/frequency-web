import type { WarmProofAttendee } from '@/components/events/warm-proof'

// Guest data shared by the live event page and its request-local context.
export type FactGuest = WarmProofAttendee & { handle: string }
