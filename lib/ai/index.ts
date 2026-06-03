// The AI core (docs/AI-STRATEGY.md, ADR-041). One kernel, reused by every AI
// surface (support search, Vera, the webmaster). Phase-1 slice: client + kill
// switch, model tiering, completion wrapper, and pure budget math. The DB-backed
// usage ledger + platform_flags kill switch land with the usage-ledger migration.

export { getAnthropic, aiEnabled } from './client'
export { MODELS, MODEL_PRICES, DEFAULT_TIER, type ModelTier, type ModelPrice } from './models'
export { completeText, AiUnavailableError, type CompleteParams, type CompleteResult } from './complete'
export {
  estimateCostUsd,
  withinBudget,
  dailyCapFor,
  FEATURE_DAILY_CAP_USD,
  type TokenUsage,
} from './budget'
export {
  getMemberContext,
  rememberFacts,
  eraseMemberContext,
  mergeFacts,
  type MemberFacts,
  type MemberContext,
} from './memory'
