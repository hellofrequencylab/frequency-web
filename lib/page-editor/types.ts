// ─────────────────────────────────────────────────────────────────────────────
// Puck type re-home — the ONE place the app imports @measured/puck TYPES from.
//
// Runtime code still imports VALUES straight from '@measured/puck' (the <Puck>
// editor + usePuck, and the still-installed client <Render> used by the mobile
// editor + spotlight live preview). The public READ path renders through the
// in-house BlockRender (lib/page-editor/block-render.tsx), which ships no editor
// runtime.
//
// Routing every type reference through this module gives us a single, swappable
// seam for the Puck document format: a future runtime drop touches this file, not
// the whole tree. Types only — fully erased at build, so this adds zero bundle
// weight and stays safe inside Server Components.
// ─────────────────────────────────────────────────────────────────────────────
export type {
  // Actively used across the repo.
  Data,
  Config,
  ComponentConfig,
  Metadata,
  // Field-model types, kept here so block/field code has one import home too.
  Fields,
  Field,
  DefaultComponentProps,
} from '@measured/puck'
