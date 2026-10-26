// SCAN-1112: inspect the active Frequency route, never the retired document template.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
export function homeFaqContract(routeText, bodyText) {
 const parse = (name,text) => ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 const route=parse('app/page.tsx',routeText), body=parse('home.tsx',bodyText)
 const nodes = root => { const result=[]; const visit=n=>{result.push(n);ts.forEachChild(n,visit)};visit(root);return result }
 const imported = tree => tree.statements.some(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@/lib/marketing/quick-answers'&&n.importClause?.namedBindings?.elements?.some(e=>e.name.text==='homeFaq'))
 if(!imported(route)||!imported(body))return false
 const active=nodes(route).find(n=>ts.isIfStatement(n)&&n.expression.getText(route)==="SITE_DESIGN === 'frequency'")
 if(!active)return false
 const code=nodes(active.thenStatement)
 const rendered=code.some(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(route)==='FrequencyHome')
 const schema=code.some(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(route)==='JsonLd'&&n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='data'&&ts.isJsxExpression(p.initializer)&&p.initializer.expression?.getText(route)==='faqSchema(homeFaq())'))
 const section=nodes(body).find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(body)==='section'&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='id'&&p.initializer?.text==='questions'))
 if(!section)return false
 const descendants=nodes(section)
 const details=descendants.some(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(body)==='details')
 const map=descendants.some(n=>ts.isCallExpression(n)&&n.expression.getText(body)==='homeFaq().map')
 const field=(tag,key)=>descendants.some(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(body)===tag&&n.children.some(c=>ts.isJsxExpression(c)&&c.expression?.getText(body)===key))
 return rendered&&schema&&details&&map&&field('summary','f.q')&&field('p','f.a')
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const ok=homeFaqContract(readFileSync('app/page.tsx','utf8'),readFileSync('components/frequency/site/pages/home/frequency-home.tsx','utf8'))
 console.log(`Frequency home FAQ visible/schema wiring: ${ok?'pass':'fail'}`);process.exit(ok?0:1)
}
