import { expect, it } from 'vitest'
import { emailSenderInventory } from './email-sender-inventory.mjs'
it('inventories Resend, independent auth mail and the direct Space campaign queue boundary', () => {
  const inventory = emailSenderInventory()
  expect(inventory.filter(x => x.boundary === 'resend-provider')).toHaveLength(1)
  expect(inventory.some(x => x.boundary === 'supabase-auth-mail')).toBe(true)
  expect(inventory.some(x => x.boundary === 'space-campaign-outbox')).toBe(true)
})
