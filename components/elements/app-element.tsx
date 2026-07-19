'use client'

// <AppElement> — the generic, typed mounter for embeddable elements (docs/EMBEDDABLE-ELEMENTS.md §2,
// ADR-792). A page "requests" an element by key and gets the ONE canonical implementation from the
// component map — no per-page fork, no prop drift. The `name` prop discriminates the rest of the
// props, so <AppElement name="loom-picker" … /> demands exactly LoomPicker's props (a wrong or missing
// prop is a compile error). This is the extension of the admin MENU-CONTRACT from menu items to UI.
//
// Two ways to mount, both routed through here:
//   • generic:      <AppElement name="loom-picker" open={o} onClose={c} onSelect={s} />
//   • typed wrapper: an element MAY export a thin wrapper that pins `name` for ergonomics, e.g.
//       export const LoomElement = (p: ElementProps<'loom-picker'>) => <AppElement name="loom-picker" {...p} />
//     A wrapper is sugar over this mounter, never a second implementation.

import { ELEMENT_COMPONENTS, type ElementPropsMap, type MountableElementKey } from './registry'

/** The props for one mountable element (its component's props), for typing a wrapper's parameter. */
export type ElementProps<K extends MountableElementKey> = ElementPropsMap[K]

/** <AppElement> props: the element `name` plus that element's own props (discriminated by name). */
export type AppElementProps<K extends MountableElementKey> = { name: K } & ElementPropsMap[K]

/** Mount an element by key. The one door: resolves the canonical component from ELEMENT_COMPONENTS and
 *  renders it with the caller's (type-checked) props. */
export function AppElement<K extends MountableElementKey>({ name, ...props }: AppElementProps<K>) {
  const Component = ELEMENT_COMPONENTS[name] as React.ComponentType<ElementPropsMap[K]>
  // props is Omit<AppElementProps<K>, 'name'>; with a multi-entry props map, TS can't see it as the
  // per-key shape, so route the (already caller-type-checked) rest through unknown.
  return <Component {...(props as unknown as ElementPropsMap[K])} />
}
