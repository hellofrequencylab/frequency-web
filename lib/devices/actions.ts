'use server'

// COUNTER SCANNER owner actions (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Three writes, each
// behind scannerOwnerGate(spaceId, 'write') inside ./store.ts (canEditProfile and the per-Space
// check-in function). The device secret is returned ONCE, by registerScanner, and never again.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getSpaceById } from '@/lib/spaces/store'
import { SCANNER_LIMITS, registerScannerDevice, revokeMemberCard, revokeScannerDevice } from './store'

async function refresh(spaceId: string) {
  const space = await getSpaceById(spaceId)
  if (space) revalidatePath(`/spaces/${space.slug}/settings`)
}

/** Register a counter scanner. Returns the id, the one-time secret and the header value to paste. */
export async function registerScanner(
  spaceId: string,
  rawLabel: unknown,
): Promise<ActionResult<{ deviceId: string; secret: string; header: string }>> {
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
  if (!label) return fail('Name the scanner, like "Front counter".')
  if (label.length > SCANNER_LIMITS.labelMax) return fail(`Keep the name under ${SCANNER_LIMITS.labelMax} characters.`)
  const out = await registerScannerDevice(spaceId, label)
  if (out === 'limit') return fail(`A Space can run ${SCANNER_LIMITS.devicesPerSpace} scanners. Revoke one first.`)
  if (!out) return fail('Could not add that scanner.')
  await refresh(spaceId)
  return ok({ deviceId: out.id, secret: out.secret, header: `${out.id}.${out.secret}` })
}

export async function revokeScanner(spaceId: string, deviceId: string): Promise<ActionResult> {
  if (typeof deviceId !== 'string' || !(await revokeScannerDevice(spaceId, deviceId))) return fail('Could not revoke that scanner.')
  await refresh(spaceId)
  return ok()
}

export async function revokeCard(spaceId: string, cardId: string): Promise<ActionResult> {
  if (typeof cardId !== 'string' || !(await revokeMemberCard(spaceId, cardId))) return fail('Could not revoke that card.')
  await refresh(spaceId)
  return ok()
}
