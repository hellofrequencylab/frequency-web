// LIVE-877 baseline: frozen legacy HTML/text before native renderer conversion.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {upgradeLayout} from '../lib/entity-blocks/node-tree.ts'
import {parseEmailRenderLayout} from '../lib/email-studio/render-layout.ts'
import {compileEmailDoc} from '../lib/email-studio/shell.ts'
import {renderEmailLayout} from '../lib/email-studio/render.ts'
const hash=value=>createHash('sha256').update(value).digest('hex')
const bytes=readFileSync('scripts/fixtures/email-node-render/legacy-golden.json')
assert.equal(hash(bytes),'4728c3906925eec0125122f6439c5ff40fae8d254661e16bbeb32f0e33c41291','pre-conversion golden strings changed')
const golden=JSON.parse(bytes)
assert.equal(hash(readFileSync('scripts/entity-layout-corpus.json')),golden.sourceSha256)
assert.equal(golden.documents.length,19)
for(const document of golden.documents)assert.deepEqual(renderEmailLayout(document.layout),document.output,document.id)
console.log('ok: all19 deterministic authored historical email outputs match pre-conversion golden strings')

for(const document of golden.documents) {
  const native=upgradeLayout(document.layout)
  assert.deepEqual(renderEmailLayout(parseEmailRenderLayout(native)),document.output,`${document.id} native equivalence`)
}
const native={rows:[{id:'r0',columns:1,cells:[[
 {nid:'nfirst01',type:'text',content:{text:'First authored placement'},style:{text:{color:'accent'}}},
 {nid:'nsecond1',type:'text',content:{text:'Second authored placement'},style:{text:{color:'muted'}}},
 {nid:'nhidden1',type:'text',hidden:true,content:{text:'Hidden authored work'}},
 {nid:'nfuture1',type:'futureType',content:{nested:{zero:0,no:false,list:[null,{text:'Future authored work'}]}}},
 {nid:'nunsafe1',type:'button',content:{label:'Unsafe link',url:'javascript:alert(1)'}},
]]}],bench:[
 {nid:'nbench01',type:'text',content:{text:'First benched placement',nested:{zero:0,no:false}}},
 {nid:'nbench02',type:'text',content:{text:'Second benched placement'},style:{text:{color:'accent'}}},
 {nid:'nbench03',type:'futureType',content:{nested:[null,false,0,{copy:'Unknown benched work'}]}},
]}
const before=JSON.stringify(native)
const parsed=parseEmailRenderLayout(native)
assert.deepEqual(parsed,native,'native read lost authored bench/identity/bags')
assert.deepEqual(upgradeLayout(parsed),parsed,'native read changed on second pass')
const compiled=compileEmailDoc({layout:parsed,subject:'Authored subject',preheader:'Authored preview'},{unsubscribeUrl:'https://example.test/unsubscribe'})
assert(compiled.text.includes('First authored placement\n\nSecond authored placement'))
assert(compiled.html.includes('#9A5E12'))
const secondOnly=renderEmailLayout({rows:[{id:'r0',columns:1,cells:[[native.rows[0].cells[0][1]]]}],bench:[]})
assert(compiled.html.includes(secondOnly.html),'second placement did not retain its own style/content')
for(const excluded of ['Hidden authored work','benched placement','Future authored work','Unknown benched work','javascript:'])assert(!compiled.html.includes(excluded),excluded)
const hrefs=[...compiled.html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(([,href])=>href)
assert(hrefs.some(href=>href==='https://example.test/unsubscribe'),'exact unsubscribe footer link missing')
assert.equal(compiled.subject,'Authored subject')
assert.equal(compiled.preheader,'Authored preview')
assert.equal(JSON.stringify(native),before,'compiler mutated stored author work')
assert.deepEqual(renderEmailLayout({rows:[],bench:native.bench}),{html:'',text:''})
assert.equal(parseEmailRenderLayout(null),null)
assert.deepEqual(renderEmailLayout(parseEmailRenderLayout({rows:[null,{columns:0,cells:[{}]}],bench:[]})),{html:'',text:''})
console.log('ok: native compiler keeps repeated content/styles and authored bench; hidden/unknown/unsafe output stays excluded')
// Integration obligations: this compiler must remain on the shipped read paths, not an unused helper.
const code=path=>readFileSync(path,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')
assert(code('lib/nurture/runner.ts').includes('parseEmailRenderLayout(r.block_json)'))
assert(code('lib/nurture/runner.ts').includes('compileEmailDoc({ layout, subject'))
assert.equal((code('lib/spaces/email-drafts.ts').match(/const layout = parseEmailRenderLayout\(row\.block_json\)/g)??[]).length,4)
assert(code('lib/email-studio/send.ts').includes('parseEmailRenderLayout(row.block_json)'))
assert(code('lib/email-studio/send.ts').includes('compileEmailDoc(doc, { unsubscribeUrl, manageUrl })'))
for(const path of ['lib/spaces/email-drafts.ts','app/(main)/admin/email-studio/actions.ts','app/(main)/admin/marketing/nurture/actions.ts'])assert(code(path).includes('return { error: NODE_LAYOUT_WRITE_ERROR }'),`${path} no longer protects incompatible writes`)
console.log('ok: native-safe parser remains integrated in nurture, Space and campaign compilation reads')

// Draft lifecycle is also a writer boundary: a native bench cannot be treated as empty.
await import('./check-email-node-draft-preservation.mjs')
