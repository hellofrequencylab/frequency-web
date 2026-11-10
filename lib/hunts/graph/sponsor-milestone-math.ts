type FrozenThresholdSnapshot = Readonly<{
  frozenAtMs: number
  /** Canonical qualification keys from confirmed results at the threshold, never live results. */
  confirmedQualificationKeys: readonly string[]
  threshold: number
  huntEndsAtMs: number
  capCents: bigint
  /** The agreement's exact pledge in cents, including fractions, before capping and rounding. */
  pledgeCents: Readonly<{ numerator: bigint; denominator: bigint }>
}>

/** Prices one Hunt's frozen threshold. The caller owns freezing and storing that snapshot once. */
export function sponsorMilestoneOwedCents(snapshot: FrozenThresholdSnapshot | null): bigint {
  const zero = BigInt(0)
  if (!snapshot) return zero
  const { threshold, huntEndsAtMs, capCents, pledgeCents } = snapshot
  if (
    !Number.isSafeInteger(threshold) || threshold < 1 ||
    !Number.isSafeInteger(huntEndsAtMs) || huntEndsAtMs < 0 ||
    capCents < zero || pledgeCents.numerator < zero || pledgeCents.denominator <= zero
  ) {
    throw new RangeError('Invalid sponsor milestone terms')
  }

  if (!Number.isSafeInteger(snapshot.frozenAtMs) || snapshot.frozenAtMs < 0) {
    throw new RangeError('Invalid sponsor threshold snapshot time')
  }

  // An unused pledge expires at the end. An earned amount still prices from its frozen snapshot.
  if (snapshot.frozenAtMs >= huntEndsAtMs) return zero
  const distinct = new Set(snapshot.confirmedQualificationKeys.filter(Boolean))
  if (distinct.size < threshold) return zero

  // Exact nonnegative integer division rounds down, without floating-point or carryover.
  const cents = pledgeCents.numerator / pledgeCents.denominator
  return cents < capCents ? cents : capCents
}
