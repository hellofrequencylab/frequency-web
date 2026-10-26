// SCAN-1148: actual final sitemap projection and installed Next XML serializer, no DB/network.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data.js'
const path='app/sitemap.ts',text=readFileSync(path,'utf8'),source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true)
const names=['escapeXml','sitemapImageUrl','xmlSafe']
const functions=names.map(name=>{const n=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,`missing ${name}`);return n.getText(source).replace(/^export /,'')}).join('\n')
const context={URL,SITE_URL:'https://canonical.example',XML_ESCAPES:{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}}
vm.runInNewContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
const inputs=['/brand/a.jpg','images/path.jpg','//cdn.example/p.jpg','https://cdn.example/a.jpg?x=1&y=2','http://cdn.example/plain.jpg','data:image/png;base64,x','javascript:alert(1)','ftp://cdn.example/x','https://user:secret@cdn.example/x','https://[invalid','','#fragment']
const entries=inputs.map((image,i)=>({url:`https://canonical.example/spaces/${i}`,images:[image]}))
const projected=context.xmlSafe(entries)
assert.deepEqual(Array.from(projected.flatMap(e=>e.images)),['https://canonical.example/brand/a.jpg','https://canonical.example/images/path.jpg','https://cdn.example/p.jpg','https://cdn.example/a.jpg?x=1&amp;y=2','http://cdn.example/plain.jpg'])
const validate=xml=>spawnSync('python3',['-c',`import sys,xml.etree.ElementTree as E,urllib.parse
root=E.fromstring(sys.stdin.read()); images=root.findall('.//{http://www.google.com/schemas/sitemap-image/1.1}loc')
assert len(images)>0
for node in images:
 u=urllib.parse.urlsplit(node.text); assert u.scheme in ('https','http') and u.netloc and not u.username
`],{input:xml,encoding:'utf8'})
assert.equal(validate(resolveSitemap(projected)).status,0,'actual XML must contain fully qualified image URLs')
assert.notEqual(validate(resolveSitemap([{url:'https://canonical.example/spaces/a',images:['/brand/a.jpg']}])).status,0,'old verbatim projection must fail the same acceptance check')
console.log('SCAN-1148: actual sitemap projection serializes complete public-origin/CDN image URLs; invalid schemes/credentials omitted; old relative projection rejected by XML acceptance')
