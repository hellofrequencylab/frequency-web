import type { BlockDensity } from './define-block'

// THE DENSITY SCALE (E3, docs/EDITOR-ARCHITECTURE.md T-3). Three steps, declared per surface by each block
// definition and never persisted per node, so a fourth step can be added without touching a stored document.
// This file is the one place a step becomes spacing. The two steps the code already shipped keep their exact
// classes (the standalone Spotlight is `roomy`, a block column inside the in-app profile is `compact`), so
// adopting the scale changes no pixel. `standard` is the spare slot between them.
//
// Literal class strings on purpose: Tailwind finds a class by scanning source, so none is assembled here.

const DENSITY_STACK: Readonly<Record<BlockDensity, string>> = {
  compact: 'space-y-6',
  standard: 'space-y-10',
  roomy: 'space-y-14',
}

/** The vertical rhythm between stacked blocks at this density. */
export function stackClassFor(density: BlockDensity): string {
  return DENSITY_STACK[density]
}
