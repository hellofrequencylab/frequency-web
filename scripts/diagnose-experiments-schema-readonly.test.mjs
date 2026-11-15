import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { schemaResult, verifySchema, EXPECTED,CATALOG_QUERY,PROVENANCE_QUERY,EXPECTED_SQL_SHA256,tableDifferences } from './diagnose-experiments-schema-readonly.mjs'
import { PROJECT } from './diagnose-migration-readonly.mjs'
const provenance={nameMatches:true,statementType:'null',statementCount:null,singleStatementSha256:null}
test('reviewed isolated catalog has exactly two tables eight protected functions and two triggers',()=>{
 assert.equal(EXPECTED.tables.length,2);assert.equal(EXPECTED.functions.length,8);assert.equal(EXPECTED.triggers.length,2)
 assert.ok(EXPECTED.tables.every(t=>t.rls&&!t.anonAnyData&&!t.authenticatedAnyData&&t.policies.length===0))
 assert.ok(EXPECTED.functions.every(f=>f.securityDefiner&&f.config.includes('search_path=public')&&!f.anonExecute&&!f.authenticatedExecute&&f.serviceExecute))
 const result=schemaResult(EXPECTED,provenance);assert.equal(result.schemaCatalogMatches,true);assert.equal(result.functionSourceMatches,true);assert.equal(result.storedRawSqlHashMatches,null)
})
test('a changed function body, policy, grant, or trigger fails exact catalog comparison',()=>{
 for(const section of ['tables','functions','triggers']){
  const copy=structuredClone(EXPECTED);copy[section][0].unexpected='changed private provider body';const result=schemaResult(copy,provenance)
  assert.equal(result.schemaCatalogMatches,false);assert.ok(result.mismatchedSections.includes(section));assert.doesNotMatch(JSON.stringify(result),/private provider/)
 }
 const copy=structuredClone(EXPECTED);copy.functions[0].sourceSha256='a'.repeat(64);assert.equal(schemaResult(copy,provenance).functionSourceMatches,false)
})
test('stored SQL provenance is never inferred from a ledger name or unavailable statements',()=>{
 assert.equal(schemaResult(EXPECTED,provenance).storedRawSqlHashMatches,null)
 assert.equal(schemaResult(EXPECTED,{...provenance,statementType:'array',statementCount:1,singleStatementSha256:EXPECTED_SQL_SHA256}).storedRawSqlHashMatches,true)
 assert.equal(schemaResult(EXPECTED,{...provenance,singleStatementSha256:'a'.repeat(64)}).storedRawSqlHashMatches,false)
})
test('only fixed read-only catalog statements reach the canonical endpoint',async()=>{
 const calls=[];const result=await verifySchema({SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:'secret'},async(url,opts)=>{
  calls.push(JSON.parse(opts.body));assert.equal(url,`https://api.supabase.com/v1/projects/${PROJECT}/database/query`)
  return {status:201,text:async()=>JSON.stringify(calls.length===1?[{catalog:EXPECTED}]:[{provenance}])}
 })
 assert.deepEqual(calls,[{query:CATALOG_QUERY,read_only:true},{query:PROVENANCE_QUERY,read_only:true}]);assert.equal(result.schemaCatalogMatches,true)
 assert.match(CATALOG_QUERY,/^select /);assert.match(PROVENANCE_QUERY,/^select /)
 const executable=(CATALOG_QUERY+PROVENANCE_QUERY).replace(/'(?:''|[^'])*'/g,"''")
 assert.doesNotMatch(executable,/\b(?:insert into|update public|delete from|create table|alter table|drop table|execute)\b/i)
})
test('configuration, HTTP errors and malformed metadata remain closed without raw output',async()=>{
 let called=false;assert.equal((await verifySchema({},async()=>{called=true})).category,'configuration_refused');assert.equal(called,false)
 const result=await verifySchema({SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:'secret'},async()=>({status:403,text:async()=>'private token secret'}))
 assert.deepEqual(result,{category:'metadata_fetch_failed',httpStatus:403});assert.doesNotMatch(JSON.stringify(result),/private|token|secret/)
})
test('catalog step cannot run after failed administrator or source verification',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/apply-migration.yml',import.meta.url),'utf8')
 assert.ok(workflow.includes("if: always() && steps.trusted_source_check.outcome == 'success'"));assert.ok(workflow.includes('id: trusted_source_check'))
})

test('owner context is reported separately and full definition drift is detected',()=>{
 const copy=structuredClone(EXPECTED);copy.functions[0].owner='postgres';copy.functions[0].ownerSuperuser=false
 const result=schemaResult(copy,provenance);assert.equal(result.schemaCatalogMatches,true);assert.equal(result.ownerContexts[0].superuser,false)
 copy.functions[0].definitionSha256='0'.repeat(64);assert.equal(schemaResult(copy,provenance).functionDefinitionMatches,false)
 assert.ok(CATALOG_QUERY.includes('TRUNCATE,REFERENCES,TRIGGER'));assert.ok(CATALOG_QUERY.includes('pg_get_functiondef'))
})

test('bounded table differences expose only known metadata names, booleans and digests',()=>{
 const actual=structuredClone(EXPECTED.tables);actual[0].anonAnyData=true
 actual[0].constraints=actual[0].constraints.filter(c=>!c.definition.startsWith('NOT NULL'))
 actual[0].constraints.push({name:'private provider body email@example.test',definition:'private raw SQL source'})
 const diff=tableDifferences(actual);assert.ok(diff.some(d=>d.field==='anonAnyData'&&d.expected===false&&d.actual===true))
 assert.ok(diff.some(d=>d.field==='constraints'&&d.missing.every(m=>m.kind==='not_null')))
 assert.doesNotMatch(JSON.stringify(diff),/private|provider|email@example|raw SQL source/)
})
