/** A profile's membership year must not depend on the rendering machine's zone. */
export function memberJoinedYear(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear()
}
