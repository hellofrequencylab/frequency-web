'use server'

// MEMBER CARDS actions (LIVE-1282, ADR-1874). The Crew "My card" editor and the Space's "Member cards"
// editor save a face through the pure normalizer first, so a hand-driven call cannot store a face the
// migration would refuse. The gates live in ./store.ts.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeFaceInput, type CardFace } from './face'
import { setMyCardActive, writeMyFace, writeSpaceFace } from './store'

export async function saveMyCardFace(raw: unknown): Promise<ActionResult<CardFace>> {
  const parsed = normalizeFaceInput(raw, false)
  if ('error' in parsed) return fail(parsed.error)
  const saved = await writeMyFace(parsed.face)
  return saved ? ok(saved) : fail('Could not save your card.')
}

export async function saveSpaceCardFace(spaceId: string, raw: unknown): Promise<ActionResult<CardFace>> {
  if (typeof spaceId !== 'string' || !spaceId) return fail('Could not save the Space card.')
  const parsed = normalizeFaceInput(raw, true)
  if ('error' in parsed) return fail(parsed.error)
  const saved = await writeSpaceFace(spaceId, parsed.face)
  return saved ? ok(saved) : fail('Could not save the Space card.')
}

export async function setMyCardOn(cardId: string, on: boolean): Promise<ActionResult> {
  if (typeof cardId !== 'string' || !cardId) return fail('Could not change that card.')
  return (await setMyCardActive(cardId, on === true)) ? ok() : fail('Could not change that card.')
}
