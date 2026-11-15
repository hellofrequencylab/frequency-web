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
