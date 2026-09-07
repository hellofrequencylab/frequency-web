'use server'

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIBE A GENERATED ASSET — the browser trick, one step later (HYG-021, ADR-1254).
//
// Every path where a PERSON picks a file computes a blurhash and a palette in the browser and posts
// them with the upload (lib/library/image-describe.ts). A path where the SERVER makes the file has
// no browser to ask, so those two columns stayed NULL and the card painted a flat placeholder. The
// fix is not a server decode: that means `sharp` in a seam the picker, the page editor, the importer
// and the email studio all reach, which is the 2026-08-11 ENOSPC fan-out (docs/DEPLOY-SAFETY.md).
// It is the SAME browser, one round-trip later — the Studio already has the generated image on
// screen, so it decodes what it is looking at and posts the descriptor here.
//
// WHAT THIS ACTION MAY DO, and nothing else:
//   · write `blurhash` and `colors`, and only where the row has none (the `.is(<col>, null)` guards
//     live in `backfillLibraryAssetDescriptor`). A client can fill a hole; it can never repaint an
//     asset somebody already described.
//   · on an IMAGE row it is authorized for, by the same rule the surrounding Loom writes use: the
//     asset's own creator, an operator of the asset's Space (canEditProfile, what `uploadLoomImage`
//     and `generateEntityCoverAction` both require), or a janitor (the Loom Studio's own floor,
//     which is where the Recraft rows land — they carry no `created_by`).
//
// Both values are re-validated here by `readImageDescriptor`, the same reader the upload path uses,
// because they arrive from a client: a malformed blurhash or a colour that is not `#rrggbb` is
// dropped rather than stored.
// ─────────────────────────────────────────────────────────────────────────────

import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { backfillLibraryAssetDescriptor, getLibraryDescriptorTarget } from './store'
import { readImageDescriptor } from './image-describe'

/** What the caller learns: which columns were filled in, if any. Never an error a member would act
 *  on — a missing placeholder is cosmetic, so every refusal reads the same way. */
export type DescribeAssetResult = { ok: true; written: string[] } | { error: string }

/**
 * Fill in the blurhash + palette of an asset that already exists, from a descriptor the browser
 * computed. Idempotent by construction: a second call writes nothing.
 */
export async function describeLibraryAssetAction(
  assetId: string,
  formData: FormData,
): Promise<DescribeAssetResult> {
  const id = (assetId ?? '').trim()
  if (!id) return { error: 'Missing asset.' }

  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in first.' }

  const target = await getLibraryDescriptorTarget(id)
  if (!target) return { error: 'We could not find that asset.' }
  // Only a raster image has a blurhash to carry. An element/SVG row would take a value that
  // describes nothing.
  if (target.kind !== 'image') return { error: 'That asset does not take a placeholder.' }

  // Nothing to do, and say so plainly rather than attempting a write the guards would drop.
  if (target.hasBlurhash && target.hasColors) return { ok: true, written: [] }

  const authorized =
    (target.createdBy !== null && target.createdBy === caller.id) ||
    isJanitor(caller.webRole) ||
    (await canWriteSpace(target.spaceId, caller.id))
  if (!authorized) return { error: 'You cannot change that asset.' }

  const described = readImageDescriptor(formData)
  if (!described.blurhash && !described.colors) return { error: 'Nothing to describe.' }

  const written = await backfillLibraryAssetDescriptor(id, {
    blurhash: target.hasBlurhash ? null : described.blurhash,
    colors: target.hasColors ? null : described.colors,
  })
  return { ok: true, written }
}

/** Can this caller write into that Space's Loom? The same `canEditProfile` authority `uploadLoomImage`
 *  and `generateEntityCoverAction` use. FAIL-SAFE to false, never a throw. */
async function canWriteSpace(spaceId: string, callerId: string): Promise<boolean> {
  try {
    const space = await getSpaceById(spaceId)
    if (!space) return false
    const caps = await getSpaceCapabilities(space, callerId)
    return caps.canEditProfile
  } catch {
    return false
  }
}
