// "Who Frequency is for", in members' own words (ADR-1715, CONTENT-VOICE §2). One list, read by
// /llms.txt and /llms-full.txt (the What is Frequency page carries the prose form), so the public answer names every reader
// the canon names and can never drift between them. The internal archetype names never appear here;
// lib/marketing/who-its-for.test.ts holds that.

export const WHO_FREQUENCY_IS_FOR_HEADING = 'Who Frequency is for'

/** One line per family of reader, plain words, no archetype names. PURE data. */
export const WHO_FREQUENCY_IS_FOR: readonly string[] = [
  'People who want to calm down fast: a few minutes with a breathing timer between meetings, then back to the day.',
  'People who just moved somewhere and want friends nearby, and people who would rather start with something to do, like a run club, a cold plunge or a supper club, than a conversation.',
  'People who want to see how it works before they trust it.',
  'People who already bring others together, like the friend who organizes the hike, and want a simple way to host one Circle.',
  'Members who like what this is and pay for Crew so it stays free for everyone.',
  'Teachers who work across several studios, practitioners starting a second career, studio owners, and people running many small groups who want one place for their people.',
]

