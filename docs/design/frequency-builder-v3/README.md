# Handoff: Frequency Builder and the New World theme

For a developer using Claude Code in `hellofrequencylab/frequency-web` (branch `main`). Revision of 2 November 2026.

## What this package is

Two things, kept apart on purpose:

1. **The block builder** (`builder/`). Frequency's page builder: the chrome a host uses to edit a Space's site, profile, Spotlight and email from one document. Owns the outline, canvas, panels, publish flow, readiness checks, Vera, history and every accessibility contract. It is theme-agnostic: it knows roles, variants and slots, never colours or fonts.
2. **The New World theme** (`theme-new-world/`). One theme in Frequency's theme system, used here as the demo Space inside the builder. Owns the look: two registers (Night and Day), an accent derived from one hue, section rendering per Frequency function, and seven content kits. The builder renders it; it does not define it.

A third folder is implied by both: Frequency's **theme system**, the contract every theme ships against (`theme-new-world/package/THEME-EDITOR-FRAMEWORK.md`, `dials.json`, `manifest.schema.md`). New World is the reference implementation of that contract. Network kit, Designer, Temple kit, Nocturne and the others convert to it one dial at a time.

## About the design files

Everything here is a **design reference built in HTML**. The builder is a single Design Component (`builder/source/Frequency Builder v3.dc.html` plus `support.js`); the theme is a scoped stylesheet, a kit file and the New World package's own JSX references. None of it is production code. Recreate it in frequency-web's existing patterns: Next.js app routes, `lib/sites/editor/*`, block components under `components/page-editor/blocks/`, the theme contract in `lib/sites/editor/theme-contract.json`, manifests in `lib/themes/manifests/`, kits in `lib/sites/kits/`. Lift token values verbatim; rebuild components in TSX.

Open `builder/Frequency Builder standalone.html` in any browser to use the builder offline with New World loaded. Open `theme-new-world/demo/New World Demo standalone.html` to see the theme on its own, outside the builder.

## Fidelity

**High-fidelity.** Colours, type, spacing, radii, copy and interaction states are final in both layers. The builder's chrome follows the Frequency design system's Commons theme exactly; the New World canvas follows the New World package exactly.

## Read in this order

1. `builder/README.md`: the builder's model, every panel, every interaction, the accessibility contract, the readiness model, the state shape.
2. `theme-new-world/README.md`: how New World renders inside the builder: registers, accent, section map, kits, what the host can and cannot change.
3. `theme-new-world/package/`: the New World package as delivered (framework, dials, manifest schema, implementation plan, token CSS, JSX references). Authoritative for the theme system.
4. `builder/research/`: the usability audit (42 findings, all repaired in this revision), the earlier audit and proposal, the navigation research and the build plan. Context, not spec.
5. `builder/frequency-web/`: the repo-shaped docs and ledger rows from the earlier build plan (`docs/EDITOR-NEXT.md`, ledger JSON). Update, do not replace.

## The one rule that separates the layers

The builder may write **structure and words**: section order, which role a section is, its variant, its slots, per-device visibility, page title and description. The theme owns **appearance**: registers, accent, type voice, spacing, motion, image treatment, and the markup of every section. A host editing in the builder never sees a colour picker or a font menu. A theme never renders a toolbar, a dialog or an outline.

## Folder map

```
README.md                        this file
builder/
  README.md                      the block builder spec
  Frequency Builder standalone.html   runnable offline, New World loaded
  source/                        the Design Component and everything it loads
  research/                      audit, proposal, navigation research, build plan
  frequency-web/                 repo-shaped docs and ledger rows (earlier revision)
theme-new-world/
  README.md                      the theme as it lives inside the builder
  theme/                         newworld.css (scoped), kits.js, Frequency mark
  package/                       the New World package as delivered (authoritative)
  demo/                          the theme standalone, outside the builder
```

Total size is well under 20 MB. Photography is the seven gathering photos already in the Frequency design system; the New World package's own photo names map onto them (see `theme-new-world/README.md`).
