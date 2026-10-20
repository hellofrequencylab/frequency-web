'use server'

// COUNTER SCANNER owner actions (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Every write runs
// behind scannerOwnerGate(spaceId, 'write') inside ./store.ts (canEditProfile and the per-Space
// check-in function). The device secret is returned ONCE, by registerScanner, and never again.
// The last three are the USB console's card flow (cyberunicorn-console.tsx): mint, then bind the chip
// the CyberUnicorn wrote, or discard the mint if the write never landed.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getSpaceById } from '@/lib/spaces/store'
import { SITE_URL } from '@/lib/site'
import { hashUid, normalizeHandle, normalizeUid } from './credentials'
import {
  SCANNER_LIMITS,
  bindConsoleCard,
  discardConsoleCard,
  issueCardFromConsole,
  registerScannerDevice,
  revokeMemberCard,
  revokeScannerDevice,
  scannerDevicesEnabled,
} from './store'

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

/** Mint a member card for the console to write. Returns the URL the CyberUnicorn writes to the card. */
export async function startConsoleCard(
  spaceId: string,
  rawHandle: unknown,
): Promise<ActionResult<{ cardId: string; url: string; memberName: string }>> {
  if (!scannerDevicesEnabled()) return fail('Counter scanners are not open yet.')
  const handle = normalizeHandle(rawHandle)
  if (!handle) return fail('Type the member’s handle, like @maya.')
  const out = await issueCardFromConsole(spaceId, handle)
  if (!out.ok) {
    if (out.reason === 'unknown_member') return fail(`No member has the handle @${handle}.`)
    if (out.reason === 'too_many_cards') return fail(`@${handle} already has ${SCANNER_LIMITS.cardsPerMember} cards here. Revoke one first.`)
    if (out.reason === 'forbidden') return fail('Only people who run check-in here can write cards.')
    return fail('Could not make that card. Try again.')
  }
  return ok({ cardId: out.cardId, url: `${SITE_URL}/c/${out.token}`, memberName: out.displayName })
}

/** The card is written: bind the chip's UID to it so a copied card is refused. */
export async function finishConsoleCard(spaceId: string, cardId: string, rawUid: unknown): Promise<ActionResult> {
  const uid = normalizeUid(rawUid)
  if (typeof cardId !== 'string' || !uid) return fail('The card was written but its chip ID did not come back.')
  if (!(await bindConsoleCard(spaceId, cardId, hashUid(uid)))) return fail('The card was written but could not be locked to its chip.')
  await refresh(spaceId)
  return ok()
}

/** The write never landed: drop the card that was minted for it. */
export async function cancelConsoleCard(spaceId: string, cardId: string): Promise<ActionResult> {
  if (typeof cardId !== 'string' || !(await discardConsoleCard(spaceId, cardId))) return fail('Could not clear that card.')
  return ok()
}
