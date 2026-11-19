#!/usr/bin/env node
// SEC-029: the free confirm-only booking action never books a service that takes a deposit while
// deposits are live. createBooking is a public server action; before this row a direct call with a paid
// service's id took the slot as confirmed with nothing paid (the guest door already refused).
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/spaces/booking.ts', import.meta.url), 'utf8')
const start = src.indexOf('export async function createBooking(')
const body = start >= 0 ? src.slice(start, src.indexOf('\nexport ', start + 10)) : ''
const place = body.indexOf('validateAndPlaceBooking(')
const guard = body.search(/productId && \(await bookingDepositsLive\(/)
if (start < 0 || place < 0 || guard < 0 || guard > place) {
  console.error('SEC-029 FAIL: createBooking places a confirmed booking without refusing a deposit service while deposits are live, so a direct call skips the deposit')
  process.exit(1)
}
console.log('SEC-029 ok: createBooking refuses a deposit service while deposits are live')
