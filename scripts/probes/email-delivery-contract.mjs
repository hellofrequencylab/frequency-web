#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { emailSenderInventory } from '../email-sender-inventory.mjs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export function verifyEmailDeliveryContract() {
  const inventory = emailSenderInventory()
  assert.equal(inventory.filter(x => x.boundary === 'resend-provider').length, 1, 'Provider must stay behind one inventoried sender seam')
  assert(inventory.some(x => x.boundary === 'supabase-auth-mail'), 'Authentication mail needs its independent provider boundary recorded')
  assert(inventory.some(x => x.boundary === 'space-campaign-outbox'), 'Space campaigns must be inventoried despite bypassing enqueueEmail')
  const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'lib/comms/email-delivery-contract.test.ts', 'lib/email-delivery-contract.test.ts'], { stdio: 'inherit' })
  return run.status ?? 1
}

if (invokedDirectly(import.meta.url)) process.exitCode = verifyEmailDeliveryContract()
