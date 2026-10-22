'use server'

// MEMBER CARDS actions (LIVE-1282, ADR-1874). The Crew "My card" editor and the Space's "Member cards"
// editor save a face through the pure normalizer first, so a hand-driven call cannot store a face the
// migration would refuse. The gates live in ./store.ts.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getMyProfileId } from '@/lib/auth'
import { searchTagTargets } from '@/lib/devices/tag-targets'
import { TAG_KIND_LABEL } from '@/lib/devices/tag-target-kinds'
import { SITE_URL } from '@/lib/site'
import { normalizeFaceInput, type CardFace } from './face'
import { setMyCardActive, setSpaceCardActive, writeMyFace, writeSpaceFace } from './store'

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

export async function setSpaceCardOn(spaceId: string, cardId: string, on: boolean): Promise<ActionResult> {
  if (typeof spaceId !== 'string' || !spaceId || typeof cardId !== 'string' || !cardId) return fail('Could not change that card.')
  return (await setSpaceCardActive(spaceId, cardId, on === true)) ? ok() : fail('Could not change that card.')
}

/** One page a card can open, for the editor's search box (LIVE-1301). */
export interface CardPage {
  kind: string
  label: string
  detail: string | null
  url: string
}

/** Pages on the site a card can open: the same public search the console's tags use, so nothing
 *  private, draft or removed is offered. Any signed-in member may search. */
export async function findCardPages(query: unknown): Promise<ActionResult<CardPage[]>> {
  if (!(await getMyProfileId())) return fail('Sign in to search pages.')
  if (typeof query !== 'string') return ok([])
  const found = await searchTagTargets(query.slice(0, 120))
  return ok(found.map((t) => ({ kind: TAG_KIND_LABEL[t.kind], label: t.label, detail: t.detail, url: new URL(t.path, SITE_URL).toString() })))
}
