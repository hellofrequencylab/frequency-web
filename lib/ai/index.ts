// The AI core (docs/AI-STRATEGY.md, ADR-041). One kernel, reused by every AI
// surface (support search, Vera, the webmaster). Phase-1 slice: client + kill
// switch, model tiering, completion wrapper, and pure budget math. The DB-backed
// usage ledger + platform_flags kill switch land with the usage-ledger migration.

export { getAnthropic, aiEnabled } from './client'
export { MODELS, MODEL_PRICES, DEFAULT_TIER, type ModelTier, type ModelPrice } from './models'
export {
  completeText,
  completeRaw,
  runToolLoop,
  AiUnavailableError,
  type CompleteParams,
  type CompleteResult,
  type CompleteRawParams,
  type CompleteRawResult,
  type CompleteMessage,
  type RunToolLoopParams,
  type ToolLoopResult,
} from './complete'
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
  mergeFacts,
  claimMembersDueForSummary,
  writeDigest,
  type MemberFacts,
  type MemberContext,
  type MemberContextForSummary,
} from './memory'
export {
  needsCompression,
  fallbackDigest,
  coerceDigest,
  countFacts,
  stalenessOf,
  compressMemberMemory,
  summarizeVeraMemory,
  SUMMARY_BATCH_LIMIT,
  type MemoryDigest,
  type MemoryStaleness,
  type SummarizeResult,
} from './memory-summary'
