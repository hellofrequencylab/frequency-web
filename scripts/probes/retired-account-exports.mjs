import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read=file=>readFileSync(file,'utf8')
function declarations(file) {
 const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true)
 return ast.statements.map(node=>({node,exported:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword), names:ts.isVariableStatement(node)?node.declarationList.declarations.map(d=>d.name.getText(ast)):node.name?[node.name.getText(ast)]:[]}))
}
for(const [file,names] of [['lib/nav/registry.ts',['SpineTab']],['lib/unlocks.ts',['STAGE_LABELS','stageIndexOf']]]) {
 const entries=declarations(file)
 for(const name of names){const entry=entries.find(e=>e.names.includes(name));assert(entry,`${name} still supports live consumers`);assert(!entry.exported,`${name} must remain module-private`)}
}
assert(!declarations('lib/context/operator-context.ts').some(e=>e.names.includes('OPERATING_HUB')))
assert(read('components/widgets/lead/lead-spaces.tsx').includes('href="/spaces/operating"'),'live operator hub door retained')
assert(read('lib/nav/registry.ts').includes('export function calmSpine(): SpineTab[]'),'live mobile tab registry retained')
assert(read('lib/unlocks.ts').includes('export function roleUnlocked('),'live role rules retained')
assert(read('lib/unlocks.ts').includes('export function stageUnlocked('),'live stage rules retained')
console.log('Retired account exports removed/private; live hub, tab registry and unlock rules retained')
