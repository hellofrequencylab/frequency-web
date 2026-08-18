'use client'

// THE ONE CODE-SPLIT BOUNDARY BETWEEN THE APP SHELL AND THE ADMIN MODULE REGISTRY (LIVE-009 · ADR-1074).
//
// `settings-panel.tsx` mounts this component through `next/dynamic`, so `module-map.tsx` — and with
// it the 42 `next/dynamic` loader stubs and the chunk-manifest entries naming their 42 chunks — is
// reached only when the rail actually renders a module body. Before this, `settings-panel.tsx`
// imported `MODULE_COMPONENTS` statically to answer a membership test it can answer from
// `module-ids.ts` instead, and the whole registry rode along on every member's first load.
//
// The `/manage` console (`entity-manage-console.tsx`) reads the registry directly and keeps doing
// so: it is reached from its own route, not from a layout that wraps ~300 pages, so its static
// import costs that route and nothing else. The rule this file exists for is about the SHELL.
//
// ⚠️ THE STATIC IMPORT BELOW IS CORRECT, AND ONLY HERE. This file is BEHIND the boundary, so its
// imports cost the chunk that opens the rail, not the shell. Moving this import back up into
// `settings-panel.tsx` "to save a file" is the regression — `scripts/check-shell-weight.test.ts`
// fails on it by name, because `@/components/admin/modules/module-map` is no longer in
// `SYNCHRONOUS_ADMIN_IMPORTS`.
//
// This is HOW the rail loads a module body, not WHAT is in the menu: the id still comes from the
// catalog through `appsForScope`, the registry is still the one in `module-map.tsx`, and no menu row
// is declared here (docs/MENU-CONTRACT.md).

import { MODULE_COMPONENTS } from './module-map'

/** Render the inline body registered for `id`, or nothing when the registry has none.
 *
 *  The null branch is a FAIL-SAFE, not the live path: `settings-panel.tsx` already filters on
 *  `INLINE_MODULE_IDS` before mounting this, and `module-map.test.ts` holds that set equal to the
 *  registry's keys. It stays because rendering nothing is a far better failure than throwing inside
 *  the rail if those two ever part company. */
export function AdminModuleBody({ id }: { id: string }) {
  const C = MODULE_COMPONENTS[id]
  return C ? <C /> : null
}
