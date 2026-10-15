// WHICH SPACE OWNS A CIRCLE, for the page chrome (SCAN-881). A Circle's Space is its `space_id`, with the
// platform ROOT Space excluded: every new Circle is stamped to the root tenant when no Space owns it
// (stampCircleSpaceId in lib/circles/store.ts), so the root is "no Space", never a real owner. The same
// guard lib/events/host-space.ts puts on events. Pure: the caller passes the root id
// (loadRootSpaceId in lib/spaces/store.ts).

export interface CircleSpaceRef {
  space_id?: string | null
  space?: { slug: string; type?: string | null } | null
}

/** The slug of the Space that owns this Circle, or null for a personal Circle (no Space, or the root). */
export function owningSpaceSlug(circle: CircleSpaceRef, rootSpaceId: string | null): string | null {
  const id = circle.space_id ?? null
  const space = circle.space ?? null
  if (!id || !space?.slug) return null
  if (rootSpaceId && id === rootSpaceId) return null
  if (space.type === 'root') return null
  return space.slug
}
