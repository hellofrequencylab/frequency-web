/**
 * Pure DJ-rotation logic (spec §5.1). No IO — all the rules that decide who
 * plays next and whether a DJ keeps their seat live here so they're testable and
 * identical server-side.
 */

export interface Seat {
  seatIndex: number;
  occupantUserId: string;
}

export interface VoteTally {
  awesome: number;
  lame: number;
  net: number;
}

/** Tally a set of votes for one play. */
export function tally(votes: Array<{ value: "awesome" | "lame" }>): VoteTally {
  let awesome = 0;
  let lame = 0;
  for (const v of votes) {
    if (v.value === "awesome") awesome++;
    else lame++;
  }
  return { awesome, lame, net: awesome - lame };
}

/** A DJ loses their seat when the room nets negative on their track. */
export function shouldBump(t: VoteTally): boolean {
  return t.net < 0;
}

/**
 * Round-robin: given the occupied seats and who just played, return the next
 * DJ's user id. Wraps around; returns the first DJ if the current one is gone
 * (e.g. just bumped); null if nobody is seated.
 *
 * `seats` need not be sorted — we sort by seatIndex for stable rotation.
 */
export function nextDj(seats: Seat[], currentDjUserId: string | null): string | null {
  if (seats.length === 0) return null;
  const ordered = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  if (!currentDjUserId) return ordered[0].occupantUserId;
  const i = ordered.findIndex((s) => s.occupantUserId === currentDjUserId);
  if (i === -1) return ordered[0].occupantUserId;
  return ordered[(i + 1) % ordered.length].occupantUserId;
}

/** Lowest free seat index for a venue of `seatCount`, or null if full. */
export function firstFreeSeat(taken: number[], seatCount: number): number | null {
  for (let i = 0; i < seatCount; i++) {
    if (!taken.includes(i)) return i;
  }
  return null;
}
