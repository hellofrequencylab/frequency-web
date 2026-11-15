import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diagnose, safeResult, METADATA, MULTI, PROJECT } from './diagnose-migration-readonly.mjs'
test('only four fixed metadata statements are transported and no error details escape',async()=>{
 const calls=[]
 const env={SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:'never-print-token'}
 const result=await diagnose(env,async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {status:403,json:async()=>({code:'42501',message:'raw email@private.test secret SQL',details:'private'})}})
 assert.deepEqual(calls.map(x=>x.body),[{query:METADATA,read_only:true},{query:METADATA,read_only:false},{query:MULTI,read_only:true},{query:MULTI,read_only:false}])
 assert.ok(calls.every(x=>x.url===`https://api.supabase.com/v1/projects/${PROJECT}/database/query`))
 assert.ok(result.every(x=>x.httpStatus===403&&x.sqlState==='42501'&&x.category==='permission'))
 assert.doesNotMatch(JSON.stringify(result),/secret|private|never-print-token/)
 assert.doesNotMatch(METADATA,/\b(?:insert|update|delete|create|alter|drop|grant|revoke|execute)\s/ig)
 assert.equal(MULTI,'begin read only; select 1 as diagnostic_value; rollback;')
})
test('result permits only bounded safe metadata',()=>{
 assert.deepEqual(safeResult(201,[{role:'postgres',ledger_count:897,target_recorded:false,private_email:'x',unsafe:'raw'}]),{httpStatus:201,category:'success',role:'postgres',ledgerCount:897,target_recorded:false})
 assert.deepEqual(safeResult(500,{code:'secret arbitrary',message:'unsafe'}),{httpStatus:500,sqlState:null,category:'provider'})
})
test('configuration mismatch never invokes a provider',async()=>{
 let called=false;await assert.rejects(diagnose({SUPABASE_PROJECT_REF:'other',SUPABASE_ACCESS_TOKEN:'x'},async()=>{called=true}));assert.equal(called,false)
})
test('workflow cannot reach writer in diagnostic mode on any ref',()=>{
 const w=readFileSync(new URL('../.github/workflows/apply-migration.yml',import.meta.url),'utf8')
 assert.ok(w.includes("if: github.ref == 'refs/heads/main' && inputs.readonly_diagnostic != true"))
 assert.ok(w.includes("if: github.repository == 'hellofrequencylab/frequency-web' && github.ref == 'refs/heads/codex/diagnostic-migration-readonly' && inputs.readonly_diagnostic == true"))
 for(const ref of ['main','codex/diagnostic-migration-readonly','other'])for(const diagnostic of [true,false]){
  const writer=ref==='main'&&!diagnostic, reader=ref==='codex/diagnostic-migration-readonly'&&diagnostic
  assert.ok(!(writer&&reader));if(diagnostic)assert.equal(writer,false)
 }
 const job=w.split('  readonly-diagnostic:')[1];assert.doesNotMatch(job,/environment:|--apply|apply-reviewed-migration/);assert.ok(job.includes('= admin'));assert.ok(job.includes("ref: ${{ github.sha }}"))
})

test('nested or message-only SQLSTATE becomes closed metadata without exposing text',()=>{
 assert.deepEqual(safeResult(500,{error:{code:'42P01',message:'private resource does not exist'}}),{httpStatus:500,sqlState:'42P01',category:'database'})
 assert.deepEqual(safeResult(500,{error:{message:'SQLSTATE 42501: permission denied for private_email@example.test'}}),{httpStatus:500,sqlState:'42501',category:'permission'})
 assert.deepEqual(safeResult(500,{message:'permission denied for private table'}),{httpStatus:500,sqlState:null,category:'permission'})
 assert.deepEqual(safeResult(500,{code:'ABCDE',message:'private unsupported code ABCDE'}),{httpStatus:500,sqlState:null,category:'provider'})
})

test('strict candidate parity executes trusted main code and candidate remains data',()=>{
 const w=readFileSync(new URL('../.github/workflows/apply-migration.yml',import.meta.url),'utf8')
 assert.ok(w.includes('ref: 085372d906f4e31a734e934cbbaf1ae647bb274d'))
 assert.ok(w.includes('ref: 085372d906f4e31a734e934cbbaf1ae647bb274d'))
 assert.ok(w.includes('for source in scripts/check-migrations.mjs scripts/check-adr.mjs scripts/check-id-collisions.mjs scripts/lib/invoked-directly.mjs scripts/lib/ledger.mjs scripts/maintenance/ledger-parity.mjs scripts/pr-size-gate.mjs; do'))
 assert.ok(w.includes('cmp "$source" "trusted-guard/$source"'))
 assert.ok(w.includes('run: node scripts/diagnose-strict-migration-parity.mjs'))
 assert.doesNotMatch(w,/run:.*(?:node|bash|sh) [^\n]*rollback-candidate/)
})

import { safeParityResult, strictParity, LEDGER_QUERY } from './diagnose-strict-migration-parity.mjs'
import { existsSync, statSync } from 'node:fs'
test('strict guard output filter never forwards provider bodies or accepts a skipped comparison',()=>{
 const secret='private provider body token'
 assert.deepEqual(safeParityResult({status:1,stderr:secret,stdout:secret}),{category:'strict_guard_failed'})
 assert.deepEqual(safeParityResult({status:0,stdout:'LEDGER COMPARISON SKIPPED '+secret}),{category:'strict_parity_not_proven'})
 const text='✅ Migration ledger parity: 897 repo file(s) ⇄ 897 applied row(s), identical on version and name.\n   versions sha256 `'+ 'a'.repeat(64) +'` · version+name sha256 `'+ 'b'.repeat(64) +'`\n'+secret
 const result=safeParityResult({status:0,stdout:text})
 assert.deepEqual(result,{category:'strict_version_name_parity',guardExit:0,repoCount:897,ledgerCount:897,versionsSha256:'a'.repeat(64),versionNameSha256:'b'.repeat(64)})
 assert.doesNotMatch(JSON.stringify(result),/private|token/)
})

test('fresh untouched ledger JSON reaches only documented trusted guard data input then is removed',async()=>{
 const rows=Array.from({length:400},(_,i)=>({version:String(20240101000000+i),name:'test'})); rows[0]={version:'20270346050000',name:'analytics_experiments'}
 const raw=JSON.stringify(rows,null,2);let file
 const runner=(node,args,opts)=>{
  file=args[3];assert.equal(args[1],'--require-ledger');assert.equal(args[2],'--ledger')
  assert.equal(args[0],'/reviewed/trusted-guard/scripts/check-migrations.mjs');assert.equal(opts.cwd,'/reviewed/rollback-candidate')
  assert.equal(readFileSync(file,'utf8'),raw);assert.equal(statSync(file).mode&0o777,0o600)
  return {status:0,stdout:'✅ Migration ledger parity: 400 repo file(s) ⇄ 400 applied row(s), identical on version and name.\n   versions sha256 `'+ 'a'.repeat(64) +'` · version+name sha256 `'+ 'b'.repeat(64) +'`'}
 }
 const result=await strictParity('/reviewed',runner,async(url,opts)=>{
  assert.equal(url,`https://api.supabase.com/v1/projects/${PROJECT}/database/query`)
  assert.deepEqual(JSON.parse(opts.body),{query:LEDGER_QUERY,read_only:true})
  return {status:201,text:async()=>raw}
 },{SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:'secret'})
 assert.equal(result.category,'strict_version_name_parity');assert.equal(existsSync(file),false)
 assert.equal(result.analytics50000Recorded,true);assert.equal(result.analytics50000NameMatches,true);assert.equal(result.hunts51000Recorded,false);assert.equal(result.hunts51000NameMatches,false);assert.equal(result.liveLedgerCount,400)
})
test('ledger fetch and shape failures remain closed and never execute a guard with invented data',async()=>{
 const env={SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:'secret'};let called=false
 const runner=()=>{called=true}
 const denied=await strictParity('/reviewed',runner,async()=>({status:403,text:async()=>'private provider body secret'}),env)
 assert.deepEqual(denied,{category:'ledger_fetch_failed',httpStatus:403})
 const invalid=await strictParity('/reviewed',runner,async()=>({status:201,text:async()=>'{}'}),env)
 assert.deepEqual(invalid,{category:'ledger_payload_refused'});assert.equal(called,false)
 assert.doesNotMatch(JSON.stringify([denied,invalid]),/secret|private/)
})
