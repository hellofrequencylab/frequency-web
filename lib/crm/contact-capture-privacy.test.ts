import { it, expect } from 'vitest'
import { verifyContactCapturePrivacy } from '../../scripts/check-contact-capture-privacy.mjs'
it('executes the actual Space contact request against two owners, two Spaces and same-email private/shared captures', async () => {
  await expect(verifyContactCapturePrivacy()).resolves.toContain('exact-Space')
})
