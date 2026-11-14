import { describe, it, expect } from 'vitest'
import { createQueryBackend, collectApplyPlan, executeApplyPlan, PRODUCTION_PROJECT } from './apply-reviewed-migration.mjs'
import { migrationBody, migrationDigest, migrationTransaction } from './lib/migration-transaction.mjs'

const REPO='hellofrequencylab/frequency-web', base='b'.repeat(40), head='c'.repeat(40)
const sources=['scripts/migration-pr-readiness.mjs','scripts/publish-migration-readiness.mjs','.github/workflows/migration-readiness.yml','scripts/migration-readiness-policy.json']
const sqlPath='supabase/migrations/20270101000000_fixture.sql'
const sql='begin;\ncreate table fixture_atomic(id integer);\ncommit;'
const complete={status:'completed',conclusion:'success'}
const app={id:15368,slug:'github-actions'}
const ledger=Array.from({length:400},(_,i)=>({version:String(20260101000000n+BigInt(i)),name:`old_${i}`}))
const core=['Start local Supabase (applies all migrations)','Run pgTAP RLS/RPC tests','Refuse an unstated permanent skip in the TAP output','Always destroy dispatched staging containers and volumes']

function fixture(){
 const files=new Map(ledger.map(r=>[`supabase/migrations/${r.version}_${r.name}.sql`,'select 1;']))
 files.set('supabase/migrations/README.md','Non-SQL migration support file')
 files.set('supabase/migrations/contract.test.ts','Non-SQL fixture support')
 for(const s of sources)files.set(s,'trusted main '+s)
 files.set('.github/workflows/db-tests.yml','trusted staging workflow')
 const added={file:sqlPath,status:'added',sha256:migrationDigest(sql),baseMode:'000000',headMode:'100644'}
 const registration={pullRequest:7,expiresAt:'2099-01-01T00:00:00Z',migrations:[{file:sqlPath,sha256:added.sha256}],reviewedChanges:[added],workflowPath:'.github/workflows/db-tests.yml',workflowSha256:migrationDigest(files.get('.github/workflows/db-tests.yml')),apiAcceptanceStep:'Actual isolated API acceptance',requiredSteps:[...core,'Actual isolated API acceptance']}
 files.set(sources[3],JSON.stringify({version:1,registrations:[registration]}))
 const candidate=new Map(files);candidate.set(sqlPath,sql)
 const receipt={version:1,pr:7,head,base,trustedRunId:'700',trustedRunAttempt:'1',sources:Object.fromEntries(sources.map(s=>[s,migrationDigest(files.get(s))])),verdict:'registered_pending_apply',registrationSha256:migrationDigest(JSON.stringify(registration)),workflowSha256:registration.workflowSha256,stagingRunId:600,stagingAttempt:1}
 const published={id:900,name:'migration-readiness',head_sha:head,app,...complete,external_id:`migration-readiness:700:1:7:${base}:${head}`,output:{summary:'Trusted proof\n\n'+JSON.stringify(receipt)}}
 const check=(id,name)=>({id,name,head_sha:head,app,...complete})
 const data={files,candidate,registration,receipt,published,checks:[check(101,'db-tests'),check(102,'test'),check(103,'lint'),published],pr:{state:'open',draft:false,user:{login:'author'},head:{sha:head,repo:{full_name:REPO}},base:{sha:base,ref:'main',repo:{full_name:REPO}}},main:{commit:{sha:base}},permission:'admin',reviews:[],ledger:[...ledger],clock:Date.parse('2026-11-14T00:00:00Z'),stage:{id:600,run_attempt:1,workflow_id:60,event:'workflow_dispatch',head_sha:head,repository:{full_name:REPO},...complete},trustedRun:{id:700,run_attempt:1,workflow_id:70,event:'pull_request_target',head_sha:head,repository:{full_name:REPO},pull_requests:[],...complete},jobCount:2,stageSteps:registration.requiredSteps.map(name=>({name,conclusion:'success'})),readCalls:0,writeCalls:0}
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:`${REPO}/.github/workflows/apply-migration.yml@refs/heads/main`,GITHUB_SHA:base,SHA:head,PR:'7',GITHUB_ACTOR:'owner',SUPABASE_PROJECT_REF:PRODUCTION_PROJECT}
 const git=(args,binary=false,input)=>{
  const map=revision=>revision===base?files:candidate
  if(args[0]==='fetch')return ''
  if(args[0]==='rev-parse')return base+'\n'
  if(args[0]==='show'){const [rev,...path]=args[1].split(':');const text=map(rev).get(path.join(':'));if(text===undefined)throw Error('Missing blob');return binary?Buffer.from(text):text}
  if(args[0]==='ls-tree'){
   const revision=args.find(x=>x===base||x===head), migrations=args.includes('supabase/migrations/')
   return [...map(revision)].filter(([file])=>!migrations||file.startsWith('supabase/migrations/')).map(([file])=>`100644 blob ${'f'.repeat(40)}\t${file}\0`).join('')
  }
  if(args[0]==='cat-file')return Buffer.concat(String(input).trim().split('\n').map(value=>{const [rev,...path]=value.split(':');const blob=Buffer.from(map(rev).get(path.join(':')));return Buffer.concat([Buffer.from(`${'f'.repeat(40)} blob ${blob.length}\n`),blob,Buffer.from('\n')])}))
  if(args[0]==='diff')return `A\0${sqlPath}\0`
  throw Error('Unexpected git operation')
 }
 const api=async path=>{
  if(path===`/repos/${REPO}/pulls/7`)return data.pr
  if(path===`/repos/${REPO}/branches/main`)return data.main
  if(path.endsWith('/permission'))return {permission:data.permission}
  if(path.includes('/reviews?'))return data.reviews
  if(path===`/repos/${REPO}/commits/${head}/check-runs?per_page=100`)return {total_count:data.checks.length,check_runs:data.checks}
  if(path.endsWith('/actions/workflows/migration-readiness.yml'))return {id:70,path:'.github/workflows/migration-readiness.yml'}
  if(path.endsWith('/actions/workflows/db-tests.yml'))return {id:60,path:'.github/workflows/db-tests.yml'}
  if(path.includes('/actions/workflows/70/runs?'))return {total_count:1,workflow_runs:[data.trustedRun]}
  if(path.includes('/actions/workflows/60/runs?'))return {total_count:1,workflow_runs:[data.stage]}
  if(path.includes('/actions/runs/700/')){
   const actual={name:'migration-readiness-runner',run_id:700,run_attempt:1,head_sha:head,runner_id:42,...complete,check_run_url:`https://api.github.com/repos/${REPO}/check-runs/800`,steps:[{name:'Evaluate migration PR readiness',conclusion:'success'}]}
   const synthetic={name:'migration-readiness',run_id:700,run_attempt:1,head_sha:head,runner_id:null,...complete,check_run_url:`https://api.github.com/repos/${REPO}/check-runs/900`,steps:[]}
   return {total_count:data.jobCount,jobs:data.jobCount===1?[actual]:[actual,synthetic]}
  }
  if(path.includes('/actions/runs/600/'))return {total_count:1,jobs:[{head_sha:head,...complete,check_run_url:`https://api.github.com/repos/${REPO}/check-runs/601`,steps:data.stageSteps}]}
  if(path.endsWith('/check-runs/800'))return check(800,'migration-readiness-runner')
  if(path.endsWith('/check-runs/601'))return check(601,'db-tests')
  throw Error('Unexpected API path')
 }
 const query=async(_sql,{readOnly})=>{if(!readOnly){data.writeCalls++;throw Error('Fixture must not write')}data.readCalls++;return data.ledger}
 // Each HTTP JSON read returns a fresh object, as the real API does. Retained
 // snapshots must not alias later fixture mutations during race regressions.
 return {data,env,git,api:async path=>structuredClone(await api(path)),query,now:()=>data.clock}
}
const collect=f=>collectApplyPlan(f)

describe('trusted apply plan',()=>{
 it('accepts actual one-evaluator API shape and non-SQL migration support files',async()=>{const f=fixture();f.data.jobCount=1;const p=await collect(f);expect(p.plan[0].action).toBe('apply');expect(f.data.writeCalls).toBe(0)})
 it('accepts authenticated real+synthetic job shape without executing candidate code',async()=>{const f=fixture();expect((await collect(f)).head).toBe(head)})
 for(const[title,mutate]of[
  ['wrong project',f=>{f.env.SUPABASE_PROJECT_REF='otherproject'}],
  ['branch workflow',f=>{f.env.GITHUB_REF='refs/heads/candidate'}],
  ['moving head',f=>{f.data.pr.head.sha='a'.repeat(40)}],
  ['non-admin without head approval',f=>{f.data.permission='write'}],
  ['expired registration',f=>{f.data.clock=Date.parse('2100-01-01T00:00:00Z')}],
  ['SQL hash changed',f=>{f.data.candidate.set(sqlPath,sql+'\nselect 2;')}],
  ['receipt PR differs',f=>{f.data.receipt.pr=8;f.data.published.output.summary='Proof\n\n'+JSON.stringify(f.data.receipt)}],
  ['missing trusted receipt',f=>{f.data.checks=f.data.checks.filter(x=>x.name!=='migration-readiness')}],
  ['untrusted app publisher',f=>{f.data.published.app={id:2,slug:'other'}}],
  ['failed source check',f=>{f.data.checks[1].conclusion='failure'}],
  ['failed newest trusted run',f=>{f.data.trustedRun.conclusion='failure'}],
  ['failed newest staging',f=>{f.data.stage.conclusion='failure'}],
  ['missing API acceptance',f=>{f.data.stageSteps=f.data.stageSteps.filter(x=>x.name!=='Actual isolated API acceptance')}],
  ['unexpected production ledger row',f=>{f.data.ledger=[...ledger,{version:'20270101000001',name:'other'}]}],
 ])it(`refuses ${title}`,async()=>{const f=fixture();mutate(f);await expect(collect(f)).rejects.toThrow();expect(f.data.writeCalls).toBe(0)})
 it('rechecks staging, readiness, expiry, PR/main and ledger immediately before a write',async()=>{
  for(const mutate of [f=>{f.data.stage.run_attempt=2},f=>{f.data.trustedRun.status='in_progress'},f=>{f.data.clock=Date.parse('2100-01-01T00:00:00Z')},f=>{f.data.pr.head.sha='a'.repeat(40)},f=>{f.data.main.commit.sha='d'.repeat(40)},f=>{f.data.ledger=[...ledger,{version:'20270101000001',name:'other'}]}]){
   const f=fixture(),p=await collect(f);mutate(f);await expect(executeApplyPlan(p,{query:f.query,dryRun:false})).rejects.toThrow();expect(f.data.writeCalls).toBe(0)
  }
 })
 it('dry-run is the default and executes no writes',async()=>{const f=fixture(),p=await collect(f);expect((await executeApplyPlan(p,{query:f.query})).dryRun).toBe(true);expect(f.data.writeCalls).toBe(0)})
 it('accepts a current independent approval but not an approval of an earlier head',async()=>{
  const f=fixture();f.data.permission='write';f.data.reviews=[{id:1,user:{login:'reviewer'},commit_id:head,state:'APPROVED'}];expect((await collect(f)).head).toBe(head)
  f.data.reviews[0].commit_id='a'.repeat(40);await expect(collect(f)).rejects.toThrow()
 })
 it('applies one atomic batch then requires its exact ledger row',async()=>{
  const f=fixture(),p=await collect(f);let writes=0
  const query=async(statement,options)=>{if(!options.readOnly){writes++;expect(statement).toContain('in exclusive mode');f.data.ledger=[...ledger,{version:'20270101000000',name:'fixture'}];return []}return f.data.ledger}
  expect((await executeApplyPlan(p,{query,dryRun:false})).dryRun).toBe(false);expect(writes).toBe(1)
 })
 it('skips an already recorded matching version without reapplication',async()=>{
  const f=fixture();f.data.ledger=[...ledger,{version:'20270101000000',name:'fixture'}];const p=await collect(f)
  expect(p.plan[0].action).toBe('skip');await executeApplyPlan(p,{query:f.query,dryRun:false});expect(f.data.writeCalls).toBe(0)
 })
 it('write uncertainty performs only readback and never retries or prints provider secrets',async()=>{const f=fixture(),p=await collect(f);await expect(executeApplyPlan(p,{query:f.query,dryRun:false})).rejects.toThrow('no write retried');expect(f.data.writeCalls).toBe(1)})
 it('reports a recorded version after ambiguous response without retrying the write',async()=>{
  const f=fixture(),p=await collect(f);let writes=0
  const query=async(_statement,options)=>{if(!options.readOnly){writes++;f.data.ledger=[...ledger,{version:'20270101000000',name:'fixture'}];throw Error('provider-secret')}return f.data.ledger}
  await expect(executeApplyPlan(p,{query,dryRun:false})).rejects.toThrow('version is recorded');expect(writes).toBe(1)
 })
})

describe('query transport',()=>{
 it('uses the existing official Management API contract, read_only, and valid201 response',async()=>{
  const calls=[],backend=createQueryBackend({SUPABASE_PROJECT_REF:PRODUCTION_PROJECT,SUPABASE_ACCESS_TOKEN:'synthetic-secret'},{fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,status:201,text:async()=>JSON.stringify(ledger)}}})
  expect(backend.kind).toBe('management-api');expect(await backend.query('select version, name from ledger',{readOnly:true})).toHaveLength(400)
  expect(JSON.parse(calls[0].options.body)).toEqual({query:'select version, name from ledger',read_only:true});expect(calls[0].url).toContain(`/projects/${PRODUCTION_PROJECT}/database/query`)
 })
 it('refuses absent credentials and wrong project before network',()=>{expect(()=>createQueryBackend({SUPABASE_PROJECT_REF:PRODUCTION_PROJECT})).toThrow();expect(()=>createQueryBackend({SUPABASE_PROJECT_REF:'wrong',SUPABASE_ACCESS_TOKEN:'synthetic'})).toThrow()})
 it('preserves the direct connection route with canonical project and encrypted transport',async()=>{
  let calls=0
  const backend=createQueryBackend({SUPABASE_PROJECT_REF:PRODUCTION_PROJECT,SUPABASE_DB_URL:`postgresql://postgres.${PRODUCTION_PROJECT}:synthetic@aws-0-test.pooler.supabase.com:5432/postgres`},{run:(_command,args)=>{calls++;expect(args).toContain('--no-psqlrc');expect(args.some(arg=>arg.includes('sslmode=require'))).toBe(true);return JSON.stringify(ledger)}})
  expect(backend.kind).toBe('psql');expect(await backend.query('select version,name from ledger',{readOnly:true})).toHaveLength(400);expect(calls).toBe(1)
  expect(()=>createQueryBackend({SUPABASE_PROJECT_REF:PRODUCTION_PROJECT,SUPABASE_DB_URL:'postgresql://postgres:secret@other.example/postgres'})).toThrow()
 })
 for(const bad of [{ok:false,status:403,text:async()=>'secret-provider-text'},{ok:true,text:async()=>JSON.stringify({error:'secret-provider-text'})},{ok:true,text:async()=>JSON.stringify([{error:'secret-provider-text'}])}])it('fails closed without serializing provider errors',async()=>{
  const backend=createQueryBackend({SUPABASE_PROJECT_REF:PRODUCTION_PROJECT,SUPABASE_ACCESS_TOKEN:'synthetic'},{fetcher:async()=>bad})
  try{await backend.query('select 1',{readOnly:true});throw Error('unsafe success')}catch(error){expect(error.message).not.toContain('secret-provider-text');expect(error.message).not.toBe('unsafe success')}
 })
})

describe('one atomic reviewed transaction',()=>{
 it('retains function-body BEGIN/COMMIT text and strips only the outer transaction',()=>{const body=migrationBody("begin; create function f() returns text language plpgsql as $$ begin return 'commit;'; end; $$; commit;");expect(body).toContain("return 'commit;'");expect(body).toContain('end; $$')})
 it('preserves statements after CR comments',()=>{expect(migrationBody('-- comment\rselect 1;')).toBe('select 1;')})
 for(const unsafe of ['select 1 as a$hidden$; commit; select 2 as b$hidden$;','select 1 as é$hidden$; commit; select 2 as b$hidden$;',String.raw`\i file.sql`,String.raw`select E'a\'b'; commit;`,'begin;select 1;rollback;','select 1;commit;','set statement_timeout=0;select 1;'])it('refuses ambiguous/control SQL before execution',()=>{expect(()=>migrationBody(unsafe)).toThrow()})
 it('binds source hash and contains lock, exact ledger check and insert in one transaction',()=>{const t=migrationTransaction({sql,version:'20270101000000',name:'fixture',sha256:migrationDigest(sql),ledger});expect(t).toContain('in exclusive mode');expect(t).toContain('pg_advisory_xact_lock');expect(t).toContain("lock_timeout = '10s'");expect(t.indexOf('create table fixture_atomic')).toBeLessThan(t.indexOf('insert into supabase_migrations'));expect(t.trim().endsWith('commit;')).toBe(true);expect(()=>migrationTransaction({sql,version:'20270101000000',name:'fixture',sha256:'0'.repeat(64),ledger})).toThrow()})
})
