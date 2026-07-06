// The Operator Console rollout flag. DEFAULT OFF: until it is turned on, every legacy /admin/* and
// /spaces/[slug]/settings/* route renders exactly as today and no console route is linked. This is
// the reversible master switch for the P0 cutover (staff, then beta operators, then everyone),
// modeled on lib/pricing/settings.ts billingLive() — additive and non-breaking.

/** Is the Operator Console enabled for this environment? Default OFF. A later step (P0:9) can swap
 *  this to a DB-backed platform flag; for now it reads a single env switch so the console can be
 *  dark in production while it is built behind it. */
export function operatorConsoleEnabled(): boolean {
  return process.env.OPERATOR_CONSOLE_ENABLED === 'true'
}
