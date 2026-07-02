'use client'

import { renderRegistryElement } from '@/lib/library/element-registry'

// Client wrapper for a code-drawn element preview in the Loom Apps lane (LP5b fix).
// `renderRegistryElement` lives in a 'use client' module, so it is a CLIENT function —
// invoking it from a Server Component throws ("cannot call a client function from the
// server"), which is what crashed the Apps lane. The Server Component resolves this
// element in `resolveAppPreview` and passes it down as a preview node (the RSC slot
// pattern), so the client function runs on the client where it belongs.
export function ElementPreview({
  registry,
  name,
  pillar,
}: {
  registry: string
  name: string
  pillar?: string
}) {
  const drawn = renderRegistryElement(registry, name, pillar)
  return <div className="flex h-full w-full items-center justify-center p-4">{drawn}</div>
}
