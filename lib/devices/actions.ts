'use server'

// COUNTER SCANNER owner actions (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Every write runs
// behind scannerOwnerGate(spaceId, 'write') inside ./store.ts (canEditProfile and the per-Space
// check-in function). The device secret is returned ONCE, by registerScanner, and never again.
// The last three are the USB console's card flow (cyberunicorn-console.tsx, in the admin menu): mint a
// member card (Frequency-wide, Crew only) or a Space card (LIVE-1282), then bind the chip the
// CyberUnicorn wrote, or discard the mint if the write never landed. Those run behind consoleStaffGate
// (platform staff) instead, and binding closes the badge requests the card answers.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getSpaceById } from '@/lib/spaces/store'
import { SITE_URL } from '@/lib/site'
import { closeBadgeRequestForCard } from './badges'
import { cardEdition, formatCardNumber } from '@/lib/member-cards/face'
import { hashUid, normalizeHandle, normalizeUid } from './credentials'
import {
  type ConsoleCardKind,
  SCANNER_LIMITS,
  bindConsoleCard,
  describeScannerForConsole,
  discardConsoleCard,
  issueCardFromConsole,
  registerScannerDevice,
  registerScannerFromConsole,
  revokeScannerFromConsole,
  revokeMemberCard,
  revokeScannerDevice,
  scannerDevicesEnabled,
} from './store'

/** "No. 0042 · Founders edition", the line staff print or write on the card. */
function printedCardLine(cardNumber: number): string {
  return `${formatCardNumber(cardNumber) ?? 'No number'} · ${cardEdition(cardNumber) === 'founders' ? 'Founders' : 'Crew'} edition`
}

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

/** Mint a card for the console to write: a Frequency-wide member card (`kind` 'member', the default), or
 *  a Space card registered to `spaceId` ('space'). Returns the URL the CyberUnicorn writes, the scope to
 *  hand back to finish/cancel (null for a member card), and the number to print on the card. */
export async function startConsoleCard(
  rawKind: unknown,
  spaceId: string | null,
  rawHandle: unknown,
): Promise<ActionResult<{ cardId: string; spaceId: string | null; url: string; memberName: string; cardNumber: number; printed: string }>> {
  if (!scannerDevicesEnabled()) return fail('Counter scanners are not open yet.')
  const kind: ConsoleCardKind = rawKind === 'space' ? 'space' : 'member'
  const handle = normalizeHandle(rawHandle)
  if (!handle) return fail('Type the member’s handle, like @maya.')
  const scope = kind === 'space' && typeof spaceId === 'string' ? spaceId : null
  if (kind === 'space' && !scope) return fail('Choose the Space this card opens first.')
  const out = await issueCardFromConsole(kind, scope, handle)
  if (!out.ok) {
    if (out.reason === 'unknown_member') return fail(`No member has the handle @${handle}.`)
    if (out.reason === 'not_crew') return fail('Member cards come with Crew. Ask them to join Crew first.')
    if (out.reason === 'not_space_staff') return fail(`@${handle} is not on this Space’s team. A Space card goes to someone who works there.`)
    if (out.reason === 'no_space') return fail('Choose the Space this card opens first.')
    if (out.reason === 'too_many_cards') {
      return fail(
        kind === 'space'
          ? `@${handle} already has ${SCANNER_LIMITS.cardsPerMember} cards for this Space. Revoke one first.`
          : `@${handle} already has ${SCANNER_LIMITS.cardsPerMember} member cards. Pause or revoke one first.`,
      )
    }
    if (out.reason === 'forbidden') return fail('Only Frequency staff can write cards.')
    return fail('Could not make that card. Try again.')
  }
  return ok({
    cardId: out.cardId,
    spaceId: out.spaceId,
    url: `${SITE_URL}/c/${out.token}`,
    memberName: out.displayName,
    cardNumber: out.cardNumber,
    printed: printedCardLine(out.cardNumber),
  })
}

/** The card is written: bind the chip's UID to it so a copied card is refused. `spaceId` is the scope
 *  startConsoleCard returned (null for a member card). */
export async function finishConsoleCard(spaceId: string | null, cardId: string, rawUid: unknown): Promise<ActionResult> {
  const uid = normalizeUid(rawUid)
  if (typeof cardId !== 'string' || !uid) return fail('The card was written but its chip ID did not come back.')
  if (!(await bindConsoleCard(spaceId, cardId, hashUid(uid)))) return fail('The card was written but could not be locked to its chip.')
  await closeBadgeRequestForCard(cardId)
  if (spaceId) await refresh(spaceId)
  revalidatePath('/admin/cyberunicorn')
  return ok()
}

/** The write never landed: drop the card that was minted for it. */
export async function cancelConsoleCard(spaceId: string | null, cardId: string): Promise<ActionResult> {
  if (typeof cardId !== 'string' || !(await discardConsoleCard(spaceId, cardId))) return fail('Could not clear that card.')
  return ok()
}

// ── Board setup over USB (build plan phase 3): the console makes the plugged-in board a Space's
// counter scanner and hands it the id and secret with `frequency.provision`. Staff only.

/** Register a scanner for the Space and return what the board needs. The secret goes straight to the
 *  board over USB and is never shown on screen. */
export async function provisionConsoleScanner(
  spaceId: string,
  rawLabel: unknown,
): Promise<ActionResult<{ deviceId: string; secret: string; base: string }>> {
  if (!scannerDevicesEnabled()) return fail('Counter scanners are not open yet.')
  const label = (typeof rawLabel === 'string' ? rawLabel.trim() : '').slice(0, SCANNER_LIMITS.labelMax) || 'CyberUnicorn'
  const out = await registerScannerFromConsole(spaceId, label)
  if (out === 'forbidden') return fail('Only Frequency staff can set up a scanner here.')
  if (out === 'limit') return fail(`That Space already runs ${SCANNER_LIMITS.devicesPerSpace} scanners. Revoke one first.`)
  if (!out) return fail('Could not set up that scanner. Try again.')
  await refresh(spaceId)
  return ok({ deviceId: out.id, secret: out.secret, base: new URL(SITE_URL).origin })
}

/** Which Space the board's scanner id belongs to. */
export async function readConsoleScanner(
  deviceId: unknown,
): Promise<ActionResult<{ spaceId: string; spaceName: string; label: string; active: boolean } | null>> {
  if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return ok(null)
  return ok(await describeScannerForConsole(deviceId.toLowerCase()))
}

/** The board forgot its setup: revoke the scanner so its id stops working. */
export async function retireConsoleScanner(deviceId: unknown): Promise<ActionResult> {
  if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return fail('That is not a scanner id.')
  if (!(await revokeScannerFromConsole(deviceId.toLowerCase()))) return fail('Could not revoke that scanner.')
  return ok()
}
