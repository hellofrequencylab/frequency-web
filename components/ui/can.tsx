// Capability-gated rendering. Render children only when the viewer holds a
// capability. Works in both server and client component trees (no hooks).
//
// The `caps` set comes from the server (lib/core/load-capabilities). This is a
// RENDER convenience only — the server still re-checks before any mutation
// (see lib/core/capabilities.ts). Never treat a hidden affordance as security.
//
//   const caps = await getCircleCapabilities(circle.id)
//   <Can caps={caps} need="circle.editSettings"><EditCircleButton/></Can>

import type { Capability } from '@/lib/core'

export function hasCapability(
  caps: readonly Capability[] | ReadonlySet<Capability>,
  need: Capability,
): boolean {
  return Array.isArray(caps) ? caps.includes(need) : (caps as ReadonlySet<Capability>).has(need)
}

export function Can({
  caps,
  need,
  fallback = null,
  children,
}: {
  caps: readonly Capability[] | ReadonlySet<Capability>
  need: Capability
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  return <>{hasCapability(caps, need) ? children : fallback}</>
}
