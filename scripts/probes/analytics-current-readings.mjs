// LIVE-1338: execute the actual readers with inert, cap-aware storage. No DB/provider/network calls.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const tables = new Map()
const reads = new Map()
let going = 2
const now = Date.now()
const day = 86400000
const iso = (delta) => new Date(now + delta * day).toISOString()
const db = { from(table) {
  if (table === 'event_blurb_cache') throw new Error('stale social-proof cache must not be read')
  const filters = []
  let range = null, order = null, head = false
  const q = {
    select(_fields, options) { head = Boolean(options?.head); return q },
    eq(column, value) { filters.push(r => r[column] === value); return q },
    neq(column, value) { filters.push(r => r[column] !== value); return q },
    gte(column, value) { filters.push(r => r[column] >= value); return q },
    lte(column, value) { filters.push(r => r[column] <= value); return q },
    gt(column, value) { filters.push(r => r[column] > value); return q },
    not() { return q }, or() { return q },
    in(column, values) { filters.push(r => values.includes(column === 'context->>eventId' ? r.event_id : r[column])); return q },
    order(column, options) { if (!order) order = [column, options?.ascending !== false]; return q },
    range(from, to) { range = [from, to]; return q },
    async maybeSingle() { const result = await q; return { ...result, data: result.data?.[0] ?? null } },
    then(resolve) {
      reads.set(table, (reads.get(table) ?? 0) + 1)
      let rows = table === 'event_rsvps' ? Array.from({length:going}, (_, i) => ({id:`r${i}`,event_id:'past',profile_id:'friend',status:'going',approval_status:'none'})) : tables.get(table) ?? []
      rows = rows.filter(r => filters.every(test => test(r)))
      if (order) { const [key, ascending] = order; rows = [...rows].sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)) }
      const count = rows.length
      const data = head ? null : rows.slice(range?.[0] ?? 0, (range?.[1] ?? 999) + 1)
      return Promise.resolve({data,error:null,count}).then(resolve)
    },
  }
  return q
} }
globalThis.__analyticsProbeDb = db
registerHooks({resolve(spec, context, next) {
  const source = spec === '@/lib/supabase/admin' ? 'export const createAdminClient=()=>globalThis.__analyticsProbeDb' : spec === 'server-only' ? '' : spec === 'react' ? 'export const cache=fn=>fn' : null
  if (source !== null) return { url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true }
  return next(spec,context)
}})
const {spaceEarningsWindows} = await import('../../lib/commerce/orders.ts')
const {loadSpaceCheckins} = await import('../../components/frequency/admin/pages/space-reads.ts')
const {eventBlurb} = await import('../../lib/ai/event-blurb.ts')
tables.set('commerce_orders', Array.from({length:1100}, (_,i) => ({id:String(i).padStart(6,'0'),owner_space_id:'A',created_at:iso(-1),currency:'usd',amount_cents:100,platform_fee_cents:5,status:'paid'})))
const money = await spaceEarningsWindows('A', [7,14,21,28,35,42,49,56,63,70,77,84,30,60], now)
assert.equal(money[12].netCents,104500)
assert.equal(reads.get('commerce_orders'),3,'all fourteen windows must share one three-page order read')
tables.set('events', Array.from({length:5000}, (_,i) => ({id:`future${i}`,space_id:'A',starts_at:iso(90),time_zone:'UTC'})).concat([{id:'past',space_id:'A',starts_at:iso(-1),time_zone:'UTC',scope_type:'circle',scope_id:'circle',energy_tag:null}]))
tables.set('engagement_events',[{id:'c',actor_profile_id:'member',created_at:iso(-1),event_id:'past',event_type:'practice.verified','context->>kind':'event_checkin'}])
assert.equal((await loadSpaceCheckins('A')).length,1,'future events must not displace the verified past check-in')
tables.set('friendships',[{id:'f',status:'accepted',user_a_id:'viewer',user_b_id:'friend'}])
assert.equal(await eventBlurb('viewer','past'),'2 connections are marked as going.')
going = 0
assert.equal(await eventBlurb('viewer','past'),null,'canceled RSVPs must remove the next request’s social proof')
console.log('ok: actual earnings report reads1100orders once across14windows;5000futureevents cannot hide verified attendance; canceledRSVPs remove current socialproof without dailycache or paidmodel')
