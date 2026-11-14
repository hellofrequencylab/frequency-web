// Neutral shared values/shape. No reward writes, database, AI, or rendering dependencies.
import type { ComposedRow } from './compose'

/** Existing per-Challenge fallback; extracting it does not change reward amounts or identities. */
export const DEFAULT_EXTRA_CREDIT_ZAPS = 25

/** Optional expression/challenge row. Completion and payout remain owned by the existing engine. */
export function extraCreditRow(title: string, body: string, zaps = DEFAULT_EXTRA_CREDIT_ZAPS): ComposedRow {
  return {
    block_type: 'exercise',
    title: title.slice(0, 200),
    body: body.slice(0, 2000),
    required: false,
    settings: { extra_credit: true, bonus_zaps: zaps },
  }
}
