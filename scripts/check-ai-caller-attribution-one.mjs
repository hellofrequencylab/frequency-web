// LIVE889: actual migrated feature dispatch plus an AST inventory of every migrated caller.
import './check-ai-accounting-preparation.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const paths = [
  "app/(main)/admin/library/vera-actions.ts",
  "app/(main)/admin/support/actions.ts",
  "lib/ai/campaign-coach.ts",
  "lib/ai/circle-compose.ts",
  "lib/ai/circle-edit.ts",
  "lib/ai/connections-ai.ts",
  "lib/ai/creator-tips.ts",
  "lib/ai/event-blurb.ts",
  "lib/ai/help-rag.ts",
  "lib/ai/journey-composition.ts",
  "lib/ai/journey-edit.ts",
  "lib/ai/journey-slot-coaching.ts",
  "lib/ai/library-tag.ts",
  "lib/ai/listing-copy.ts",
  "lib/ai/memory-summary.ts",
  "lib/ai/messaging-generator.ts",
  "lib/ai/poster-observer.ts",
  "lib/ai/practice-curate.ts",
  "lib/ai/practice-edit.ts",
  "lib/ai/practice-publish-screen.ts",
  "lib/ai/quality-gate.ts",
  "lib/ai/space-copilot.ts",
  "lib/ai/spark.ts",
  "lib/ai/vera-calendar.ts",
  "lib/ai/vera/agent-claude.ts"
]
let calls = 0
for (const path of paths) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let localCalls = 0
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (['completeRaw','completeText','runToolLoop'].includes(node.expression.text)) {
        calls++; localCalls++
        const params = node.arguments[0]
        assert.ok(params && ts.isObjectLiteralExpression(params) && params.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'accounting'), `${path} lost attribution`)
      }
      assert.notEqual(node.expression.text, 'recordAiUsage', `${path} duplicates central paid usage`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(localCalls > 0, `${path} has no inventoried completion`)
}
const state = globalThis.__legacyCompletionProbe
state.enabled = true; state.overBudget = false; state.rateLimited = false
const sources = new Map([
 ['./usage', 'export const aiAvailable=async()=>globalThis.__legacyCompletionProbe.enabled;export const featureOverBudget=async()=>globalThis.__legacyCompletionProbe.overBudget;export const recordAiUsage=async(row)=>{globalThis.__legacyCompletionProbe.ledger.push(row)}'],
 ['./rate-limit', 'export const aiRateLimited=async()=>globalThis.__legacyCompletionProbe.rateLimited'],
 ['./voice', 'export const withVoice=s=>s'],
 ['@/lib/email-studio/analytics', 'export const getCampaignMetrics=async()=>({hasSent:true,attributionMode:"tracked",delivered:10,openRate:0.4,opened:4,clickRate:0.2,clicked:2,bounceRate:0,bounced:0,unsubscribed:0,complained:0})'],
])
registerHooks({resolve(spec, context, next){if(sources.has(spec)&&context.parentURL?.endsWith('/lib/ai/campaign-coach.ts'))return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {analyzeCampaignOpenRate}=await import('../lib/ai/campaign-coach.ts')
const reset=()=>{state.dispatches=0;state.ledger=[];state.reservations.clear();state.fail=false;state.replies=[{content:[{type:'text',text:'Synthetic coaching'}],usage:{input_tokens:10,output_tokens:2}}]}
reset();assert.deepEqual(await analyzeCampaignOpenRate('synthetic-campaign','actor'),{ok:true,analysis:'Synthetic coaching'});assert.equal(state.dispatches,1);assert.equal(state.ledger.length,1);assert.equal(state.ledger[0].feature,'campaign-coach');assert.equal(state.ledger[0].profileId,'actor')
for(const flag of ['enabled','overBudget','rateLimited']){reset();state[flag]=flag!=='enabled';assert.equal((await analyzeCampaignOpenRate('synthetic-campaign','actor')).ok,false);assert.equal(state.dispatches,0);assert.deepEqual(state.ledger,[]);state[flag]=flag==='enabled'}
reset();state.fail=true;assert.equal((await analyzeCampaignOpenRate('synthetic-campaign','actor')).ok,false);assert.deepEqual(state.ledger,[])
console.log(`ok: ${calls} migrated completion calls retain attribution without duplicate local writes; actual campaign dispatch meters once and preserves switch/budget/throttle/failure fallback`)
