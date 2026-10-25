// Bounded representative actual-source consequences. Full financial Vitest/CI remains separate.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {invokedDirectly} from '../lib/invoked-directly.mjs'
export function financialCopyConsequences(root=process.cwd(),overrides={}) {
 const req=createRequire(path.join(root,'package.json')),ts=req('typescript'),React=req('react'),{renderToStaticMarkup}=req('react-dom/server')
 const read=f=>overrides[f]??fs.readFileSync(path.join(root,f),'utf8')
 const parse=f=>ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 const evaluate=(code,globals={})=>{const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{assert.equal(n,'react/jsx-runtime');return req(n)},...globals},{timeout:1000});return exports}
 const storyFile='lib/pricing/plan-story.ts', story=parse(storyFile)
 assert.equal(story.statements.filter(ts.isImportDeclaration).length,0,'Pricing narrative remains a leaf')
 const {PLAN_STORY}=evaluate(read(storyFile))
 const sectionFile='app/(marketing)/pricing/pricing-sections.tsx', sections=parse(sectionFile)
 const fn=sections.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PricingPromises');assert.ok(fn,'Actual promise renderer exists')
 const wrapper=({children})=>React.createElement('section',null,children)
 const {PricingPromises}=evaluate(fn.getText(sections),{PLAN_STORY,Section:wrapper,Card:wrapper,SectionHeading:()=>null,Illustration:()=>null})
 const html=renderToStaticMarkup(React.createElement(PricingPromises))
 assert.match(html,/Paid Space plans and introduction fees are separate/)
 assert.match(html,/eligible purchases/);assert.match(html,/after card processing/)
 assert.match(html,/100%/)
 // The shipped Offering-to-card adapter must forward price and checkout identity, not fabricate them.
 const pageFile='components/frequency/site/pages/pricing/frequency-pricing.tsx',page=parse(pageFile)
 const adapter=page.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='offeringView');assert.ok(adapter)
 const {offeringView}=evaluate(adapter.getText(page)+'\nexports.offeringView=offeringView;')
 for(const monthly of [0,47600]) {
  const input={label:'Synthetic plan',tagline:'Fixture',monthly,yearly:monthly*10,listAnchor:'pricing-fixture',billing:'Monthly',trial:null,betaNote:'',takeRate:'Fee fixture',forWho:'Fixture scope',cta:{href:'/operator/start?plan=network',label:'Review plan'},featured:true}
  const view=offeringView(input,'fixture-hue')
  assert.equal(view.price,input.monthly);assert.equal(view.yearly,input.yearly);assert.equal(view.anchor,input.listAnchor)
  assert.equal(view.cta,input.cta);assert.equal(view.name,input.label);assert.equal(view.hue,'fixture-hue')
  assert.equal(JSON.stringify(view.points),JSON.stringify(['Monthly','Fee fixture']))
 }
 const buying=page.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(page)==='BUYING_NOTE');assert.ok(buying?.initializer)
 const note=evaluate(`exports.note=${buying.initializer.getText(page)}`).note
 const noteHtml=renderToStaticMarkup(React.createElement('p',null,note))
 assert.match(noteHtml,/Review the price and applicable fees before paying/);assert.doesNotMatch(noteHtml,/paid straight to the host/)
 return {cases:4,scope:'Actual PricingPromises React SSR with actual leaf narrative; actual Offering adapter with two synthetic input cases; actual buying-note initializer. Inert layout wrappers only. Not full pricing page, catalog/capability/visual/provider proof.'}
}
if(invokedDirectly(import.meta.url)) console.log(financialCopyConsequences())
