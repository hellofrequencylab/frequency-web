// THE SIX TINTS of the member pricing box, one per rung, pastel stops of the --fq-pa gradient walked from
// pink to aqua. The design export carries them as literals and no token names them one by one, so they are
// colour DATA here (lib/theme/ is the palette home) and reach the box as the `--pbx-tint` custom property.
// A leaf: no imports, so the client box can take it without a fan-out.

export const PRICING_TIERS_TINT = [
  '#EEC1EC', // token-ok: palette source, --fq-pa pink stop, the Member rung
  '#E6BEE0', // token-ok: palette source, between pink and lavender, the Crew rung
  '#B8C4FF', // token-ok: palette source, --fq-pa lavender stop, the Space rung
  '#B0C8FF', // token-ok: palette source, between lavender and sky, the Business rung
  '#A3D4FF', // token-ok: palette source, --fq-pa sky stop, the Collective rung
  '#8FE9FF', // token-ok: palette source, --fq-pa aqua stop, the Network rung
] as const
