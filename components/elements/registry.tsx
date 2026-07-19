'use client'

// The embeddable-elements COMPONENT MAP (docs/EMBEDDABLE-ELEMENTS.md §2, ADR-792). The single door a
// page uses to MOUNT an element: an ElementKey -> its ONE canonical client component. Pages mount
// through <AppElement name="…" /> (or a typed wrapper), never by forking a component into the page.
//
// This is the render-side twin of the PURE catalog in lib/elements/registry.ts (which holds each
// element's features + role gates, client-safe). They are kept in lock-step by the drift test
// (components/elements/registry.test.ts): every key here must be a registered ElementKey. Extend the
// map as an element adopts the framework — that is the ONLY place a new mountable element is wired.

import type { ComponentType } from 'react'
import { LoomPicker } from '@/components/loom/loom-picker'
import type { ElementKey } from '@/lib/elements/registry'

/** The props each mountable element accepts, keyed by element key. This is what makes <AppElement>
 *  type-safe: `name="loom-picker"` demands exactly LoomPicker's props. Add a line as an element is
 *  wired. A key here MUST be a registered ElementKey (compile-checked: the map is typed by it). */
export interface ElementPropsMap {
  'loom-picker': React.ComponentProps<typeof LoomPicker>
}

/** The subset of ElementKey that is actually mountable today (has a component + props entry). An
 *  element can be registered (features/gates declared) before its component lands; this narrows to the
 *  ones you can mount right now. */
export type MountableElementKey = keyof ElementPropsMap & ElementKey

/** THE component map. One canonical component per mountable element. The only render-side registry. */
export const ELEMENT_COMPONENTS: {
  [K in MountableElementKey]: ComponentType<ElementPropsMap[K]>
} = {
  'loom-picker': LoomPicker,
}
