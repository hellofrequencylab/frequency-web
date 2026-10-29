// THE FIRST QUESTION (LIVE-1917), the pure half. A launch that has made nothing and has no Space yet opens by asking
// what the person came to set up: a Space for what they run (the whole launch), or just their personal Spotlight.
// Everyone has a personal Spotlight; a Space is the step up. Anyone who already made something, or already has a
// Space, skips the question: the launch picks up where they stopped. PURE.

export const PERSONAL_SPOTLIGHT_HREF = '/profile'

/** True when the launch should ask what the person came to set up. */
export function showIntent(l: { spaceId: string | null | undefined; made: readonly unknown[] }): boolean {
  return !l.spaceId && l.made.length === 0
}
