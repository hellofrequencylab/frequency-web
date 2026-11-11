// THE LAUNCH CAMPAIGN DATES. One contract (LIVE-BETA-LAUNCH-CAMPAIGN, owner 2026-11-04; beta end moved by the
// owner 2026-11-11): the official launch is January 1, 2027, inside the beta, and the beta runs through
// January 31, 2027. Every beta label,
// the public opening date and the founder-badge window read these constants; nothing types the date.
//
// PURE (constants and string helpers) so it is safe in a server page, an email builder and a test.
// This module is COPY. Whether a feature gate bites is the `pricing_settings.beta_grace` row, and a
// member's personal paid offer clock (the 72-hour offer) is its own timer. Neither reads this file.

/** The last day of the beta, as a calendar date. */
const BETA_ENDS_ON = '2027-01-31'

/** The official launch day, as a calendar date. */
export const LAUNCH_ON = '2027-01-01'

/** The last day of the beta as members read it, no year (surrounding copy gives the year). */
export const BETA_ENDS_DAY_LABEL = 'January 31'

/** The launch day as members read it, no year. */
const LAUNCH_DAY_LABEL = 'January 1'

/** What a member who joins during the beta is called. Recognition is for taking part before launch;
 *  it is not a paid tier and it does not touch any personal paid clock. */
const FOUNDING_MEMBER_NAME = 'Founding Member'

/** One plain line that says who is a Founding Member and until when. */
const FOUNDING_MEMBER_LINE = `Join before ${LAUNCH_DAY_LABEL} and you are a ${FOUNDING_MEMBER_NAME}. Beta runs through ${BETA_ENDS_DAY_LABEL}.`

/** The one-line recognition copy, for the offer and welcome surfaces to read. */
export const FOUNDING_MEMBER_COPY = { name: FOUNDING_MEMBER_NAME, line: FOUNDING_MEMBER_LINE, endsOn: BETA_ENDS_ON } as const
