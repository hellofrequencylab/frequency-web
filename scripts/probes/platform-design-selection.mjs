import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {invokedDirectly} from '../lib/invoked-directly.mjs'
const parse=(name,source)=>ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
function find(file,predicate){const found=[];function visit(node){if(predicate(node))found.push(node);ts.forEachChild(node,visit)}visit(file);return found}
export async function verifyPlatformSelection(designSource,configSource){
 const design=parse('design.ts',designSource),config=parse('next.config.ts',configSource)
 const resolver=find(design,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='resolveDesign')
 const defaultValue=find(design,n=>ts.isVariableDeclaration(n)&&n.name.getText(design)==='DEFAULT_DESIGN')
 const selector=find(config,n=>ts.isVariableDeclaration(n)&&n.name.getText(config)==='FREQUENCY_DESIGN')
 const redirects=find(config,n=>ts.isMethodDeclaration(n)&&n.name.getText(config)==='redirects')
 for(const [label,found]of [['resolver',resolver],['default',defaultValue],['selector',selector],['redirects',redirects]])assert.equal(found.length,1,label)
 assert(ts.isCallExpression(selector[0].initializer.left)&&selector[0].initializer.left.expression.getText(config)==='resolveDesign','selector uses canonical resolver')
 const registry=find(design,n=>ts.isVariableDeclaration(n)&&n.name.getText(design)==='DESIGNS')
 const guard=find(design,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='isDesignId')
 assert.equal(registry.length,1,'design registry'); assert.equal(guard.length,1,'design guard')
 const code=ts.transpileModule(`const DESIGNS=${registry[0].initializer.getText(design)};${guard[0].getText(design).replace(/^export\s+/,'')};const DEFAULT_DESIGN=${defaultValue[0].initializer.getText(design)};${resolver[0].getText(design).replace(/^export\s+/,'')};return resolveDesign;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
 const resolveDesign=new Function(code)()
 const select=new Function('resolveDesign','process',`return ${selector[0].initializer.getText(config)}`)
 const redirect=new Function('FREQUENCY_DESIGN',`return async function()${redirects[0].body.getText(config)}`)
 let unrelated
 for(const raw of [undefined,'','unknown','dawn','frequency']){
  const frequency=resolveDesign(raw)==='frequency'
  const rules=await redirect(select(resolveDesign,{env:{NEXT_PUBLIC_SITE_DESIGN:raw}}))()
  for(const [source,destination]of [['/practice',frequency?'/features#f-zaps':'/help/the-quest'],['/the-quest',frequency?'/features#f-zaps':'/help/the-quest'],['/the-lab',frequency?'/vision':'/about']])assert.deepEqual(rules.find(rule=>rule.source===source),{source,destination,permanent:frequency},`${source}:${String(raw)}`)
  const others=rules.filter(rule=>!['/practice','/the-quest','/the-lab'].includes(rule.source))
  if(unrelated)assert.deepEqual(others,unrelated,'unrelated redirects unchanged across selections');else unrelated=others
 }
}
if(invokedDirectly(import.meta.url)){
 await verifyPlatformSelection(readFileSync('lib/theme/design.ts','utf8'),readFileSync('next.config.ts','utf8'))
 console.log('ok: actual canonical resolver and redirect body agree across five selections; unrelated routes retained')
}
