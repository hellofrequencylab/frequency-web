// COARSENING A COORDINATE SO A PLACE CAN BE FOUND WITHOUT ITS ADDRESS BEING PUBLISHED.
//
// Two layers of the Around You map need this, for the same reason and with the same guarantee:
//
//   • an EVENT whose host set `hide_address`. The title and the time are public and the list
//     beside the map shows them; the street is not. Measured in production 2026-08-13, that was
//     10 of 20 upcoming event rows and 3 of the 5 distinct gatherings, so excluding them outright
//     left the map showing ONE event. The owner's call (2026-08-13) was an approximate pin.
//   • a SPACE whose owner picked `approximate` in Profile and Settings. Same idea, chosen
//     deliberately rather than inherited from an event flag.
//
// ── 🔴 THE GUARANTEE, AND WHY IT IS QUANTISATION AND NOT A JITTER ──────────────────────────────
//
// The obvious implementation is "offset the real point by a pseudo-random amount derived from the
// row id". That is NOT private, and it is worth being precise about why, because it looks private:
// the algorithm is in this repo and the row id is in the page's own URL, so anyone can recompute
// the exact offset and SUBTRACT it. A deterministic jitter is a reversible encoding of the true
// coordinate, not a redaction of it.
//
// So the true coordinate is DESTROYED first. The point is snapped to a fixed global grid, and only
// the grid cell survives:
//
//   truth ──quantise──▶ cell (lossy, irreversible) ──jitter──▶ what the map draws
//
// An attacker who knows everything in this file recovers the CELL and stops there, because nothing
// downstream of the snap carries the sub-cell information any more. The cell is ~1.1 km north to
// south, and ~0.9 km east to west at San Diego county's latitude: a neighbourhood, not a building.
//
// The jitter exists for one reason and it is not privacy: without it every approximate pin in a
// cell lands on the identical cell centre, so two different Spaces one street apart would stack
// exactly, and a row of them would visibly snap to a lattice. It is cosmetic, it is applied AFTER
// the information is already gone, and it never widens the guarantee.
//
// PURE, ZERO IMPORTS. No React, no Next, no Supabase, no map library. It is arithmetic, it is
// tested as arithmetic (lib/maps/approximate.test.ts), and it is importable from a server loader
// and a client component alike.

/** The grid the truth is destroyed against, in degrees. 0.01° is ~1.11 km of latitude everywhere,
 *  and ~0.93 km of longitude at 33°N. Everything inside one cell is indistinguishable afterwards,
 *  which is the whole privacy claim. */
export const APPROX_GRID_DEG = 0.01

/** Cosmetic spread inside the cell, in degrees, so pins do not stack on cell centres. Strictly
 *  smaller than half a cell so a drawn point stays inside the cell it came from. */
export const APPROX_JITTER_DEG = 0.004

/** Worst-case distance between the true point and the drawn one, in metres. The corner of a cell
 *  to its centre (~0.0071° ≈ 790 m) plus the full jitter (~445 m). Quoted in the UI copy and
 *  asserted in the tests, so the number a member is told and the number the code produces are the
 *  same number. */
export const APPROX_MAX_ERROR_M = 1250

/**
 * FNV-1a, 32-bit. A tiny, dependency-free, deterministic string hash.
 *
 * It is NOT a cryptographic hash and does not need to be: it is only choosing where inside an
 * already-anonymous cell to draw the dot. Nothing secret is ever fed to it.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // The FNV prime, via shifts, because a plain `h * 16777619` loses precision past 2^53.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** A stable [0, 1) from a seed and a salt. */
function unit(seed: string, salt: string): number {
  return hash32(`${seed}#${salt}`) / 0x100000000
}

/** Snap a value to the centre of its grid cell. This is the step that destroys the address. */
function toCellCentre(value: number): number {
  return Math.floor(value / APPROX_GRID_DEG) * APPROX_GRID_DEG + APPROX_GRID_DEG / 2
}

/**
 * The public point for a place whose exact location is withheld.
 *
 * `seed` should be the row's id: stable, so the pin does not wander between renders, and distinct,
 * so two places in one cell do not land on the same dot.
 *
 * Returns null for a coordinate that is not a real lat/lng, so a malformed row draws NOTHING
 * rather than a pin somewhere off the coast of Africa. A caller must treat null as "no pin".
 */
export function approximatePoint(
  lat: number,
  lng: number,
  seed: string,
): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  const cellLat = toCellCentre(lat)
  const cellLng = toCellCentre(lng)

  // Seeded from the CELL, not from the input point. Two rows that quantise to the same cell must
  // scatter differently, but neither offset may carry a trace of where in the cell it started.
  const key = `${seed}@${cellLat.toFixed(4)},${cellLng.toFixed(4)}`
  // Uniform over the disc: sqrt on the radius, else the points bunch toward the centre.
  const angle = unit(key, 'angle') * 2 * Math.PI
  const radius = Math.sqrt(unit(key, 'radius')) * APPROX_JITTER_DEG

  const outLat = cellLat + Math.sin(angle) * radius
  // Longitude degrees are shorter than latitude degrees away from the equator, so the east-west
  // offset is divided by cos(lat) to keep the scatter round on the ground rather than an ellipse.
  const shrink = Math.max(Math.cos((cellLat * Math.PI) / 180), 0.2)
  const outLng = cellLng + (Math.cos(angle) * radius) / shrink

  return {
    lat: Math.min(Math.max(outLat, -90), 90),
    lng: ((((outLng + 180) % 360) + 360) % 360) - 180,
  }
}

/** What a member is told when a pin is coarsened because the HOST withheld the address. Plain
 *  sentences, no em dashes (docs/CONTENT-VOICE.md §10). */
export const APPROX_EVENT_NOTE = 'Approximate area. The host shares the address when you RSVP.'

/** The same, for a Space whose owner chose an approximate location. Nothing to RSVP to, so the
 *  sentence stops after the honest half. */
export const APPROX_SPACE_NOTE = 'Approximate area.'
