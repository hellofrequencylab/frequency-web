'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for space-scoped codes (ENTITY-SPACES-BUILD §C, Phase 2).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure helpers,
// the cap table, or the shared types. Those live in lib/qr/space-codes.ts (no directive: gated IO +
// the cap policy + the action implementations + types) and lib/qr/splash.ts (the pure splash shape).
// This thin file is the seam the CLIENT surface imports, so the mutations cross the network boundary
// as proper Server Actions:
//   qr-splash-form.tsx -> createSpaceCode, setCodeSplash
//
// SERVER components (the owner QR page, any self-fetching analytics) import the READ helpers
// (listSpaceCodes / listSpaceScanRows) directly from lib/qr/space-codes.ts: they never cross a client
// boundary, so they need no wrapper. The authorization + validation + the per-plan cap all live in
// the implementations; these wrappers just re-expose them.

import {
  createSpaceCode as createSpaceCodeImpl,
  setCodeSplash as setCodeSplashImpl,
  type CreateSpaceCodeInput,
} from '@/lib/qr/space-codes'
import { type Splash } from '@/lib/qr/splash'
import { type ActionResult } from '@/lib/action-result'

/** Create a managed code for a Space. Gated on canEditProfile + the per-plan cap (in the impl). */
export async function createSpaceCode(
  spaceId: string,
  input: CreateSpaceCodeInput,
): Promise<ActionResult<{ slug: string }>> {
  return createSpaceCodeImpl(spaceId, input)
}

/** Set (or clear, with null) a code's splash. Gated on canEditProfile of the code's own Space. */
export async function setCodeSplash(codeId: string, splash: Splash | null): Promise<ActionResult> {
  return setCodeSplashImpl(codeId, splash)
}
