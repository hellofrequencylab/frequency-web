// LIVE890: actual migrated feature dispatch plus an AST inventory of every migrated caller.
import './check-ai-accounting-preparation.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const paths = [
  "lib/ai/vera/feature-posts.ts",
  "lib/ai/vera/owner-brief.ts",
  "lib/ai/vera/today.ts",
  "lib/circles/social-fuel.ts",
  "lib/comms/vera-conversation.ts",
  "lib/crm/brief.ts",
  "lib/crm/import/ai.ts",
  "lib/dashboard/person-band.ts",
  "lib/demo/ai-palette.ts",
  "lib/importer/compose.ts",
  "lib/importer/extract/run.ts",
  "lib/importer/reframe/demographic.ts",
  "lib/importer/reframe/run.ts",
  "lib/importer/verify/refute.ts",
  "lib/importer/vision.ts",
  "lib/listing-seeder/extract.ts",
  "lib/studio/recommendations.ts",
  "lib/studio/winback.ts",
  "lib/vera-dispatch.ts",
  "lib/whatsapp/extract.ts"
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
 ['@/lib/ai/usage', 'export const aiAvailable=async()=>globalThis.__legacyCompletionProbe.enabled;export const featureOverBudget=async()=>globalThis.__legacyCompletionProbe.overBudget;export const recordAiUsage=async(row)=>{globalThis.__legacyCompletionProbe.ledger.push(row)}'],
 ['@/lib/ai/voice', 'export const withVoice=s=>s'],
 ['@/lib/dashboard/verdict', 'export const tierLabel=s=>s'],
])
registerHooks({resolve(spec, context, next){if(sources.has(spec)&&context.parentURL?.endsWith('/lib/dashboard/person-band.ts'))return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {draftContextLine,deterministicContextLine}=await import('../lib/dashboard/person-band.ts')
const scores={resonanceTier:null,lifecycleStage:'new',nextBestAction:'activate'}
const fallback=deterministicContextLine('Ada',scores)
const reset=()=>{state.dispatches=0;state.ledger=[];state.reservations.clear();state.fail=false;state.replies=[{content:[{type:'text',text:'Synthetic standing'}],usage:{input_tokens:10,output_tokens:2}}]}
reset();assert.equal(await draftContextLine('Ada',scores),'Synthetic standing');assert.equal(state.dispatches,1);assert.equal(state.ledger.length,1);assert.equal(state.ledger[0].feature,'today')
for(const flag of ['enabled','overBudget']){reset();state[flag]=flag!=='enabled';assert.equal(await draftContextLine('Ada',scores),fallback);assert.equal(state.dispatches,0);assert.deepEqual(state.ledger,[]);state[flag]=flag==='enabled'}
reset();state.fail=true;assert.equal(await draftContextLine('Ada',scores),fallback);assert.deepEqual(state.ledger,[])
reset();const unscored={resonanceTier:null,lifecycleStage:null,nextBestAction:null};assert.equal(await draftContextLine('Ada',unscored),deterministicContextLine('Ada',unscored));assert.equal(state.dispatches,0);assert.deepEqual(state.ledger,[])
console.log(`ok: ${calls} migrated completion calls retain attribution without duplicate local writes; actual context drafting meters once and preserves switch/budget/unscored/provider-failure fallback`)
