'use server'

// THE CLIENT-CALLABLE SERVER ACTION for the header mega-menu launcher (WEBSITE-CHANGES-PLAN §6 E.3).
//
// A 'use server' module may export ONLY async functions, so the reader + its types live in
// lib/spaces/managed.ts (no directive: the IO + the ManagedSpace type, unit-testable). This thin
// file is the seam the CLIENT mega-menu imports, so the read crosses the network boundary as a
// proper Server Action:
//   manage-mega-menu.tsx -> getManagedSpaces()
//
// SERVER components could import listManagedSpaces directly from lib/spaces/managed.ts; the mega-menu
// is a client component (it owns the open/dismiss interaction), so it reaches the reader through this
// wrapper. The auth + tenancy + fail-safe guarantees all live in the implementation (it re-resolves
// the viewer's own id and fails safe to []); this wrapper just re-exposes it.

import { listManagedSpaces, type ManagedSpace } from '@/lib/spaces/managed'

/** The Spaces the signed-in viewer manages (owned or active editor+), for the launcher. Fail-safe to
 *  [] for a signed-out viewer or on any error. */
export async function getManagedSpaces(): Promise<ManagedSpace[]> {
  return listManagedSpaces()
}
