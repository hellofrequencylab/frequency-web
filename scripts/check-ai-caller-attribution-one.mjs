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
  "lib/ai/connections-ai.ts",
  "lib/ai/creator-tips.ts",
  "lib/ai/help-rag.ts",
  "lib/ai/library-tag.ts",
  "lib/ai/writing-coach.ts",
  "lib/ai/memory-summary.ts",
  "lib/ai/messaging-generator.ts",
  "lib/ai/poster-observer.ts",
  "lib/ai/practice-curate.ts",
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
// Explicit delegates retain the existing feature/tier and caller attribution through Spark.
for (const [file, entity, feature, tier] of [
  ['practice-edit', 'practice', 'practice-edit', 'sonnet'],
  ['journey-edit', 'journey', 'journey-edit', 'sonnet'],
  ['journey-composition', 'journey', 'journey-composition', 'sonnet'],
  ['journey-slot-coaching', 'journey', 'journey-slot-coaching', 'haiku'],
]) {
const practiceEdit = ts.createSourceFile(file + '.ts', readFileSync('lib/ai/' + file + '.ts', 'utf8'), ts.ScriptTarget.Latest, true)
let sparkImport = false, boundedSpec = false, attributedRun = false
function verifyPracticeDelegate(node) {
  if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === './spark') sparkImport = !!node.importClause?.namedBindings?.elements?.some(e => e.name.text === 'runSpark')
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text
    assert.ok(!['completeRaw', 'completeText', 'runToolLoop', 'recordAiUsage', 'getAnthropic'].includes(name), 'Practice edit must not bypass shared accounting')
    if (name === 'writingCoachingSpec') boundedSpec = node.arguments.map(a => a.getText(practiceEdit)).join(',') === [entity, feature, tier].map(v => "'" + v + "'").join(',')
    if (name === 'runSpark') {
      const params = node.arguments[1]
      attributedRun = ts.isObjectLiteralExpression(params) && params.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(practiceEdit) === 'profileId' && p.initializer.getText(practiceEdit) === 'input.profileId')
    }
  }
  ts.forEachChild(node, verifyPracticeDelegate)
}
verifyPracticeDelegate(practiceEdit)
assert.ok(sparkImport && boundedSpec && attributedRun, file + ' lost its shared, attributed coaching dispatch')
}
// These modules delegate their paid work to the inventoried writing-coach seam.
// Keep the legacy feature attribution and prohibit a second direct completion.
for (const [path, feature] of [['circle-compose', 'circle-compose'], ['circle-edit', 'circle-edit'], ['listing-copy', 'listing-copy'], ['circle-spark', 'circle-create']]) {
 const source = ts.createSourceFile(path, readFileSync(`lib/ai/${path}.ts`, 'utf8'), ts.ScriptTarget.Latest, true)
 let delegated = 0
 function inspect(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
   assert.ok(!['completeRaw','completeText','runToolLoop','recordAiUsage'].includes(node.expression.text), `${path} bypassed the shared accounting seam`)
   if (node.expression.text === 'writingCoach') {
    const args = node.arguments[0]
    assert.ok(args && ts.isObjectLiteralExpression(args), `${path} lost explicit coaching options`)
    const label = args.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'feature')
    assert.ok(label && ts.isStringLiteral(label.initializer) && label.initializer.text === feature, `${path} lost its accounting feature`)
    delegated++
   }
  }
  ts.forEachChild(node, inspect)
 }
 inspect(source); assert.equal(delegated, 1, `${path} lost its coaching delegation`)
}
// Event explanations now render current deterministic facts and must never reintroduce a paid caller.
const factSource = ts.createSourceFile('lib/ai/event-blurb.ts', readFileSync('lib/ai/event-blurb.ts', 'utf8'), ts.ScriptTarget.Latest, true)
function verifyFactOnly(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    assert.ok(!['completeRaw', 'completeText', 'runToolLoop', 'getAnthropic', 'recordAiUsage'].includes(node.expression.text), 'event facts reintroduced a model call')
  }
  ts.forEachChild(node, verifyFactOnly)
}
verifyFactOnly(factSource)
const state = globalThis.__legacyCompletionProbe
state.enabled = true; state.overBudget = false; state.rateLimited = false
const sources = new Map([
 ['./usage', 'export const aiAvailable=async()=>globalThis.__legacyCompletionProbe.enabled;export const featureOverBudget=async()=>globalThis.__legacyCompletionProbe.overBudget;export const recordAiUsage=async(row)=>{globalThis.__legacyCompletionProbe.ledger.push(row)}'],
 ['./rate-limit', 'export const aiRateLimited=async()=>globalThis.__legacyCompletionProbe.rateLimited'],
 ['./voice', 'export const withVoice=s=>s'],
 ['@/lib/email-studio/analytics', 'export const getCampaignMetrics=async()=>({hasSent:true,attributionMode:"exact",delivered:10,openRate:0.4,opened:4,clickRate:0.2,clicked:2,bounceRate:0,bounced:0,unsubscribed:0,complained:0})'],
])
registerHooks({resolve(spec, context, next){if(sources.has(spec)&&context.parentURL?.endsWith('/lib/ai/campaign-coach.ts'))return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {analyzeCampaignOpenRate}=await import('../lib/ai/campaign-coach.ts')
const reset=()=>{state.dispatches=0;state.ledger=[];state.reservations.clear();state.fail=false;state.replies=[{content:[{type:'text',text:'{"questionIds":["attendance_measurement"]}'}],usage:{input_tokens:10,output_tokens:2}}]}
reset();const coached=await analyzeCampaignOpenRate('synthetic-campaign','actor');assert.equal(coached.ok,true);assert.equal(coached.source,'coach');assert.equal(coached.analysis,'How will you record who attended, separately from who clicked?');assert.equal(state.dispatches,1);assert.equal(state.ledger.length,1);assert.equal(state.ledger[0].feature,'campaign-coach');assert.equal(state.ledger[0].profileId,'actor')
for(const flag of ['enabled','overBudget','rateLimited']){reset();state[flag]=flag!=='enabled';assert.equal((await analyzeCampaignOpenRate('synthetic-campaign','actor')).source,'checklist');assert.equal(state.dispatches,0);assert.deepEqual(state.ledger,[]);state[flag]=flag==='enabled'}
reset();state.fail=true;assert.equal((await analyzeCampaignOpenRate('synthetic-campaign','actor')).source,'checklist');assert.deepEqual(state.ledger,[])
console.log(`ok: ${calls} migrated completion calls retain attribution without duplicate local writes; actual campaign dispatch meters once and preserves switch/budget/throttle/failure fallback`)
