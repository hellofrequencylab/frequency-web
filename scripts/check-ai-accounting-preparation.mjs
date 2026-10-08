// LIVE888: execute the transitional completion wrapper, never a paid provider or a test runner.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const state = { ledger: [], dispatches: 0, replies: [], fail: false, reservations: new Map() }
globalThis.__legacyCompletionProbe = state
const sources = new Map([
  ['./client', 'export const getAnthropic=()=>({messages:{countTokens:async()=>({input_tokens:10}),create:async()=>{const s=globalThis.__legacyCompletionProbe;s.dispatches++;if(s.fail)throw Error("Synthetic failure");return s.replies.shift()}}})'],
  ['./usage', 'export const aiAvailable=async()=>true;export const recordAiUsage=async(row)=>{globalThis.__legacyCompletionProbe.ledger.push(row)}'],
  ['server-only', ''],
  ['@/lib/log', 'export const log={error:()=>{}}'],
  ['@/lib/supabase/admin', `export const createAdminClient=()=>({rpc:async(name,p)=>{const s=globalThis.__legacyCompletionProbe;if(name==='ai_reserve_attempt'){s.reservations.set(p.p_id,p);return {data:true,error:null}}if(name==='ai_settle_attempt'){const r=s.reservations.get(p.p_id);s.ledger.push({feature:r.p_feature,model:r.p_model,profileId:r.p_profile,spaceId:r.p_space,operationId:r.p_operation,inputTokens:p.p_input_tokens,outputTokens:p.p_output_tokens,costUsd:p.p_actual});return {data:true,error:null}}if(name==='ai_hold_attempt')return {data:true,error:null};throw Error('Unexpected accounting endpoint')}})`],
])
registerHooks({ resolve(spec, context, next) {
  if (sources.has(spec) && (!spec.startsWith('./') || context.parentURL?.endsWith('/lib/ai/complete.ts'))) return { url: `data:text/javascript,${encodeURIComponent(sources.get(spec))}`, shortCircuit: true }
  return next(spec, context)
} })
const { completeRaw, completeText, runToolLoop } = await import('../lib/ai/complete.ts')
function message(tool = false) {
  return { content: tool ? [{ type: 'tool_use', id: 'tool-1', name: 'lookup', input: {} }] : [{ type: 'text', text: 'Synthetic reply' }], usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }
}
const request = { system: 'Synthetic', messages: [{ role: 'user', content: 'Synthetic input' }] }
const reset = () => { state.ledger = []; state.dispatches = 0; state.replies = [message()]; state.fail = false; state.reservations.clear() }
reset();
try { await completeRaw(request); assert.equal(state.dispatches, 1) }
catch (error) { assert.equal(error.stage, 'invalid_request'); assert.equal(state.dispatches, 0) }
assert.deepEqual(state.ledger, [])
const inputTokens = row => row.inputTokens ?? (row.usage.inputTokens + (row.usage.cacheReadInputTokens ?? 0) + (row.usage.cacheCreationInputTokens ?? 0))
const outputTokens = row => row.outputTokens ?? row.usage.outputTokens
reset(); const result = await completeText({ ...request, accounting: { feature: 'practice-curate', profileId: 'actor', spaceId: 'space' } })
assert.equal(state.ledger.length, 1); const row=state.ledger[0]; assert.equal(row.feature, 'practice-curate'); assert.equal(row.profileId, 'actor'); assert.equal(row.spaceId, 'space'); assert.match(row.model, /claude/); assert.equal(inputTokens(row), 17); assert.equal(outputTokens(row), 2); assert.equal(row.costUsd, result.costUsd)
assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 }); assert.ok(result.costUsd > 0)
reset(); state.replies = [message(true), message()]
const loop = await runToolLoop({ ...request, accounting: { feature: 'vera-chat', profileId: 'actor' }, tools: [], maxRounds: 2, onToolCalls: () => [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Synthetic result' }] })
assert.equal(state.dispatches, 2); assert.ok(state.ledger.length === 1 || state.ledger.length === 2)
assert.equal(state.ledger.reduce((sum, row) => sum + inputTokens(row), 0), 34); assert.equal(state.ledger.reduce((sum, row) => sum + outputTokens(row), 0), loop.usage.outputTokens)
assert.equal(loop.usage.inputTokens, 20); for (const row of state.ledger) { assert.equal(row.feature, 'vera-chat'); assert.equal(row.profileId, 'actor'); assert.equal(row.model, loop.model) }
assert.equal(state.ledger.reduce((sum, row) => sum + row.costUsd, 0), result.costUsd * 2)
if (state.ledger.length === 2) {
  for (const row of state.ledger) { assert.equal(typeof row.operationId, 'string'); assert.ok(row.operationId.length > 0) }
  assert.equal(new Set(state.ledger.map(row => row.operationId)).size, 1)
}
reset(); state.fail = true; await assert.rejects(() => completeRaw({ ...request, accounting: { feature: 'practice-curate' } }), /Synthetic failure/); assert.deepEqual(state.ledger, [])
console.log('ok: central completions record actual attributed usage once; loop ledger totals represent returned tokens and cost without duplication; omitted context never creates unattributed wrapper usage; failed providers invent no successful usage')
