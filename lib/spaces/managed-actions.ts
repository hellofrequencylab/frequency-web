'use server'

// THE CLIENT-CALLABLE SERVER ACTION for the header mega-menu launcher (WEBSITE-CHANGES-PLAN §6 E.3).
//
// A 'use server' module may export ONLY async functions, so the reader + its types live in
// lib/spaces/managed.ts (no directive: the IO + the ManagedSpace type, unit-testable). This thin
// file is the Server Action seam a client launcher imports, so the read crosses the network
// boundary as a proper Server Action: someClient -> getManagedSpaces().
//
// (The original header mega-menu launcher was retired per ADR-349; this wrapper is kept as the
// stable Server Action seam for any client surface that needs the managed-Spaces list.)
//
// SERVER components could import listManagedSpaces directly from lib/spaces/managed.ts; a client
// surface (owning its own open/dismiss interaction) reaches the reader through this wrapper. The
// auth + tenancy + fail-safe guarantees all live in the implementation (it re-resolves the
// viewer's own id and fails safe to []); this wrapper just re-exposes it.

import { listManagedSpaces, type ManagedSpace } from '@/lib/spaces/managed'

/** The Spaces the signed-in viewer manages (owned or active editor+), for the launcher. Fail-safe to
 *  [] for a signed-out viewer or on any error. */
export async function getManagedSpaces(): Promise<ManagedSpace[]> {
  return listManagedSpaces()
}
