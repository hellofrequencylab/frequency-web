// Narrow service RPC call/result contract shared by accounting and operator readers.
// This adapter receives an already-authorized admin client; it never creates an admin handle.
import type { SupabaseClient } from '@supabase/supabase-js'

type Contracts = {
  ai_reserve_attempt: { args: { p_id: string; p_operation: string; p_feature: string; p_model: string; p_estimate: number; p_profile: string | null; p_space: string | null; p_global_cap: number; p_feature_cap: number; p_space_cap: number }; result: boolean }
  ai_settle_attempt: { args: { p_id: string; p_input_tokens: number; p_output_tokens: number; p_actual: number; p_cache_read_tokens?: number | null; p_cache_creation_tokens?: number | null }; result: boolean }
  ai_hold_attempt: { args: { p_id: string; p_reason: string }; result: boolean }
  ai_member_turns_today: { args: { p_profile: string }; result: number }
  ai_budget_status_today: { args: undefined; result: { feature: string; spent: number; reserved: number; uncertain: number; pending_ids: string[] | null }[] }
  // PROG-E8 4b, migration 20270346130000 (applied 2026-11-23). The reader still treats any error as "no split".
  ai_tokens_today: { args: undefined; result: { feature: string; prompt_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; split_rows: number; unsplit_rows: number }[] }
}
export async function accountingRpc<N extends keyof Contracts>(client: SupabaseClient, name: N, args: Contracts[N]['args']): Promise<{ data: Contracts[N]['result'] | null; error: { message: string; code?: string } | null }> {
  const untyped = client as unknown as { rpc(name: string, args?: unknown): Promise<{ data: unknown; error: { message: string; code?: string } | null }> }
  // Literal names let the migration contract gate verify every actual endpoint.
  const response = name === 'ai_reserve_attempt' ? await untyped.rpc('ai_reserve_attempt', args)
    : name === 'ai_settle_attempt' ? await untyped.rpc('ai_settle_attempt', args)
    : name === 'ai_hold_attempt' ? await untyped.rpc('ai_hold_attempt', args)
    : name === 'ai_member_turns_today' ? await untyped.rpc('ai_member_turns_today', args)
    : name === 'ai_tokens_today' ? await untyped.rpc('ai_tokens_today', args)
    : await untyped.rpc('ai_budget_status_today', args)
  return response as { data: Contracts[N]['result'] | null; error: { message: string; code?: string } | null }
}
