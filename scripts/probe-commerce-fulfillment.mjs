// LIVE-882 consequence probe: execute the REAL checkout dispatcher without a test runner,
// database connection or payment provider. The migration's actual lock/grant wiring is checked too.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
const source = fs.readFileSync('lib/commerce/checkout.ts','utf8')
const migration = fs.readFileSync('supabase/migrations/20270346007300_commerce_fulfillment_continuity.sql','utf8')
for (const name of ['claim_commerce_settlement','grant_paid_commerce_journey','revoke_refunded_commerce_journeys']) {
  const body = migration.split(`function public.${name}(`)[1]?.split('end $$;')[0]
  assert.ok(body && /for update/i.test(body), `${name} must retain the order lock`)
}
assert.match(migration,/journey_plan_adoptions add column if not exists order_id/)
assert.match(fs.readFileSync('lib/journey-plans.ts','utf8'),/rpc\('grant_paid_commerce_journey'/)
assert.match(fs.readFileSync('lib/commerce/journey-fulfilment.ts','utf8'),/rpc\('revoke_refunded_commerce_journeys'/)
let paid=false, lease=null, grantAttempts=0, grants=0, stock=0, finance=0, receipts=0
const steps={}
const row={id:'order',owner_kind:'platform',owner_profile_id:null,owner_space_id:null,entity_id:'entity',amount_cents:1000,platform_fee_cents:0,buyer_profile_id:'buyer',currency:'usd',funds_flow:'destination'}
const admin=()=>({from(table) {
  let update=false
  const b={update(){update=true;return b},select(){return b},eq(){return b},in(){return b},
    then(resolve,reject) {
      const data=table==='commerce_orders' ? update ? paid ? [] : (paid=true,[row]) : paid ? [row] : [] : []
      return Promise.resolve({data,error:null}).then(resolve,reject)
    }}
  return b
},async rpc(name,args) {
  if(name==='claim_commerce_settlement') {
    if(Object.keys(steps).length===5) return {data:{state:'complete'},error:null}
    if(lease) return {data:{state:'busy'},error:null}
    lease=args._token;return {data:{state:'claimed',steps:{...steps}},error:null}
  }
  if(name==='advance_commerce_settlement') {
    assert.equal(args._token,lease)
    if(args._step) steps[args._step]=true
    return {data:true,error:null}
  }
  if(name==='release_commerce_settlement') {lease=null;return {data:null,error:null}}
  if(name==='decrement_commerce_stock_atomic') {stock++;return {data:null,error:null}}
  throw new Error(`unexpected RPC ${name}`)
}})
const inert=new Proxy({},{get:()=>()=>null})
const imports={
  '@/lib/supabase/admin':{createAdminClient:admin},
  '@/lib/finance/record':{recordFinancialTransaction:async(input)=>{assert.equal(input.idempotencyKey,'commerce_order:order');finance++}},
  '@/lib/spaces/booking':{confirmBookingByOrder:async()=>{},cancelBookingByOrder:async()=>{}},
  './journey-fulfilment':{enrolByOrder:async()=>{grantAttempts++;if(grantAttempts===1)throw new Error('transient grant failure');grants++},revokeJourneyByOrder:async()=>{}},
  './order-receipt':{sendOrderReceipts:async()=>{receipts++}},
  './shipping':{shippingDetailsFromSession:()=>null},
}
const exports={}
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
vm.runInNewContext(code,{exports,module:{exports},require:(name)=>imports[name]??inert,console,crypto:webcrypto,Date,Map,Set,URL},{filename:'checkout.ts'})
const session={id:'session',payment_status:'paid',payment_intent:'pi',amount_total:1000,currency:'usd',metadata:{kind:'commerce_order'}}
await assert.rejects(exports.recordCommerceOrderFromSession(session),/transient grant failure/)
assert.equal(paid,true)
await exports.recordCommerceOrderFromSession(session)
await exports.recordCommerceOrderFromSession(session)
assert.deepEqual({stock,finance,grants,receipts},{stock:1,finance:1,grants:1,receipts:1})
assert.equal(grantAttempts,2)
console.log('commerce fulfillment: paid replay repairs access once; completed money/stock/receipt work stays once')
