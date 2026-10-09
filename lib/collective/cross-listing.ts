// A listing never changes source ownership, edit permission or a Circle's entry rules.
export type CrossListingKind = 'journey' | 'circle'
export type CrossListingStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export function canRespondToCrossListing(status: string, side: 'source' | 'target', next: string): boolean {
  if (next === 'revoked') return status === 'pending' || status === 'accepted'
  return side === 'target' && status === 'pending' && (next === 'accepted' || next === 'declined')
}
export function crossListingVisible(kind: CrossListingKind, subject: { visibility?: string | null; unlisted?: boolean | null; status?: string | null }): boolean {
  return kind === 'journey' ? subject.status !== 'rejected' && (subject.visibility === 'public' || subject.visibility === 'unlisted')
    : subject.unlisted !== true && (subject.status === 'active' || subject.status === 'forming')
}
