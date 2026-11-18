#!/usr/bin/env node
// EMAIL-056: Contact the seller honors a block like every other path that opens a 1:1 thread. Fails when the block check
// is gone or comes after the conversation is opened.
import { readFileSync } from 'node:fs'
const src = readFileSync('lib/marketplace/listing-offers.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function submitListingContact'))
const block = fn.indexOf('isBlockedBetween(viewerId, sellerId)')
const open = fn.indexOf('findOrCreateDirectConversation(')
if (block < 0 || open < 0 || block > open) { console.error('Contact the seller opens a thread without checking for a block'); process.exit(1) }
console.log('ok: Contact the seller checks for a block first')
