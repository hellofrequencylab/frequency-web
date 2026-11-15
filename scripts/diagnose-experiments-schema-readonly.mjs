import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { PROJECT } from './diagnose-migration-readonly.mjs'
export const EXPECTED_SQL_SHA256='ebefee10a1e936f2e7516ecd6a70fb1242ce0638bedf517522ecbdfb6cb894bb'
export const CATALOG_QUERY=readFileSync(new URL('./diagnostics/analytics-experiments-metadata.sql',import.meta.url),'utf8')
export const PROVENANCE_QUERY=readFileSync(new URL('./diagnostics/analytics-experiments-provenance.sql',import.meta.url),'utf8')
export const EXPECTED=JSON.parse(readFileSync(new URL('./diagnostics/analytics-experiments-expected.json',import.meta.url),'utf8'))
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const comparisonCatalog=catalog=>({...catalog,functions:catalog.functions.map(({owner:_owner,ownerSuperuser:_super,ownerBypassRls:_bypass,...rest})=>rest)})
const safeIdentifier=value=>typeof value==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(value)?value:null
const constraintKind=value=>typeof value==='string'?(value.startsWith('NOT NULL')?'not_null':value.startsWith('FOREIGN KEY')?'foreign_key':value.startsWith('PRIMARY KEY')?'primary_key':value.startsWith('UNIQUE')?'unique':value.startsWith('CHECK')?'check':'other'):'absent'
export function tableDifferences(actualTables) {
 const differences=[]
 for(const expected of EXPECTED.tables) {
  const actual=actualTables.find(table=>table?.name===expected.name)
  if(!actual){differences.push({table:expected.name,field:'table',expectedPresent:true,actualPresent:false});continue}
  for(const key of Object.keys(expected).filter(key=>typeof expected[key]==='boolean')) if(actual[key]!==expected[key]) differences.push({table:expected.name,field:key,expected:expected[key],actual:typeof actual[key]==='boolean'?actual[key]:null})
  for(const key of ['columns','constraints']) {
   const expectedItems=expected[key], actualItems=Array.isArray(actual[key])?actual[key]:[]
   const missing=expectedItems.filter(item=>!actualItems.some(other=>other?.name===item.name)).map(item=>({name:item.name,...(key==='constraints'?{kind:constraintKind(item.definition)}:{})}))
   const extra=actualItems.filter(item=>!expectedItems.some(other=>other.name===item?.name)).slice(0,40).map(item=>({name:safeIdentifier(item?.name),kind:key==='constraints'?constraintKind(item?.definition):'column',itemSha256:digest(item)}))
   const changed=expectedItems.flatMap(item=>{const other=actualItems.find(value=>value?.name===item.name);return other&&digest(item)!==digest(other)?[{name:item.name,fields:Object.keys(item).filter(field=>digest(item[field])!==digest(other[field]??null)).map(field=>({field,expectedSha256:digest(item[field]),actualSha256:digest(other[field]??null),...(typeof item[field]==='boolean'?{expected:item[field],actual:typeof other[field]==='boolean'?other[field]:null}:{})}))}]:[]})
   if(missing.length||extra.length||changed.length)differences.push({table:expected.name,field:key,expectedCount:expectedItems.length,actualCount:actualItems.length,missing,extra,changed})
  }
  for(const key of ['indexes','policies']) if(digest(expected[key])!==digest(actual[key]))differences.push({table:expected.name,field:key,expectedCount:expected[key].length,actualCount:Array.isArray(actual[key])?actual[key].length:null,expectedSha256:digest(expected[key]),actualSha256:digest(actual[key]??null)})
 }
 return differences
}
export function schemaResult(catalog,provenance) {
 if (!catalog || !['tables','functions','triggers'].every(key=>Array.isArray(catalog[key])&&catalog[key].length<=30)) return {category:'catalog_shape_refused'}
 const compared=comparisonCatalog(catalog),expectedCompared=comparisonCatalog(EXPECTED)
 const mismatchedSections=['tables','functions','triggers'].filter(key=>digest(compared[key])!==digest(expectedCompared[key]))
 const expectedFunctions=EXPECTED.functions
 const functionSourceMatches=expectedFunctions.every(expected=>catalog.functions.some(actual=>actual.signature===expected.signature&&actual.sourceSha256===expected.sourceSha256))&&catalog.functions.length===expectedFunctions.length
 const functionDefinitionMatches=expectedFunctions.every(expected=>catalog.functions.some(actual=>actual.signature===expected.signature&&actual.definitionSha256===expected.definitionSha256))&&catalog.functions.length===expectedFunctions.length
 const ownerContexts=expectedFunctions.map(expected=>{const actual=catalog.functions.find(f=>f.signature===expected.signature);return {function:expected.name,owner:typeof actual?.owner==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(actual.owner)?actual.owner:null,superuser:typeof actual?.ownerSuperuser==='boolean'?actual.ownerSuperuser:null,bypassRls:typeof actual?.ownerBypassRls==='boolean'?actual.ownerBypassRls:null}})
 const hash=typeof provenance?.singleStatementSha256==='string'&&/^[a-f0-9]{64}$/.test(provenance.singleStatementSha256)?provenance.singleStatementSha256:null
 return {category:'catalog_read',schemaCatalogMatches:mismatchedSections.length===0,mismatchedSections,tableDifferences:tableDifferences(catalog.tables),functionSourceMatches,functionDefinitionMatches,ownerContexts,comparisonScope:'reviewed tables, privileges, function definitions, and triggers; owner context reported separately; raw applied migration unknown unless stored SQL hash matches',tableCount:catalog.tables.length,functionCount:catalog.functions.length,triggerCount:catalog.triggers.length,expectedCatalogSha256:digest(expectedCompared),actualCatalogSha256:digest(compared),expectedSqlSha256:EXPECTED_SQL_SHA256,ledgerNameMatches:provenance?.nameMatches===true,storedStatementType:['array','string','null','absent'].includes(provenance?.statementType)?provenance.statementType:'unknown',storedStatementCount:Number.isSafeInteger(provenance?.statementCount)&&provenance.statementCount>=0?provenance.statementCount:null,storedSingleSqlSha256:hash,storedRawSqlHashMatches:hash===null?null:hash===EXPECTED_SQL_SHA256}
}
export async function verifySchema(env,fetcher=fetch) {
 if(env.SUPABASE_PROJECT_REF!==PROJECT||!env.SUPABASE_ACCESS_TOKEN) return {category:'configuration_refused'}
 const values=[]
 for(const query of [CATALOG_QUERY,PROVENANCE_QUERY]) {
  try {
   const response=await fetcher(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true}),redirect:'error',signal:AbortSignal.timeout(30000)})
   if(response.status<200||response.status>=300)return {category:'metadata_fetch_failed',httpStatus:response.status}
   const raw=await response.text();if(raw.length>2_000_000)return {category:'metadata_size_refused'}
   const body=JSON.parse(raw);if(!Array.isArray(body)||body.length!==1)return {category:'metadata_shape_refused'}
   values.push(body[0])
  }catch{return {category:'metadata_unavailable'}}
 }
 return schemaResult(values[0].catalog,values[1].provenance)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await verifySchema(process.env);console.log(JSON.stringify(result));if(result.category!=='catalog_read')process.exitCode=1}
