// Historical generation identifiers remain readable for saved cookies, Space rows and
// janitor-managed metadata. Frequency resolves every request to balanced; these IDs
// no longer require platform CSS presets or promise a rendered contrast variant.
// Keep validation and saved-data cleanup compatible; runtime retirement is tested in
// retired-axis-runtime.test.ts and the actual CSS absence in generations.test.ts.

/** The set of authored generation ids. Retained for saved-data validation and cleanup compatibility. */
export type GenerationId =
  | 'spacious'
  | 'classic'
  | 'balanced'
  | 'bold'
  | 'playful'
  | 'kids-early'
  | 'kids-mid'
  | 'kids-tween'

/** The full declaration of a generation — its id plus member-facing, naming-canon copy. */
export interface GenerationDef {
  /** Stable id, the `[data-generation]` value and the `spaces.generation` column value. */
  id: GenerationId
  /** Short, member-facing label (docs/NAMING.md, docs/CONTENT-VOICE.md — plain, no em dashes). */
  label: string
  /** One plain phrase on the feel (voice: warm, plain, never narrates the reader's feelings). */
  vibe: string
  /** Which spectrum this belongs to — the adult feel scale or the kids age bands. */
  group: 'adult' | 'kids'
  /** Stable display order across both groups (adult 0-4, then kids 5-7). */
  order: number
  /** The accessibility contrast FLOOR this preset must hold. AAA for the calm + kids ends. */
  minContrast: 'AA' | 'AAA'
}

/**
 * Every registered generation. The adult spectrum runs spacious → playful (calm and
 * roomy to lively and dense); the kids spectrum runs little → tween (age bands per NN/g).
 * `balanced` (the middle of the adult spectrum) is the default everywhere.
 */
export const GENERATIONS: readonly GenerationDef[] = [
  // ── Adult spectrum ────────────────────────────────────────────────────────────
  {
    id: 'spacious',
    label: 'Spacious',
    vibe: 'Big type and lots of room, with the calmest surface.',
    group: 'adult',
    order: 0,
    minContrast: 'AAA',
  },
  {
    id: 'classic',
    label: 'Classic',
    vibe: 'The steady, familiar Frequency look.',
    group: 'adult',
    order: 1,
    minContrast: 'AAA',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    vibe: 'A comfortable middle that suits most people.',
    group: 'adult',
    order: 2,
    minContrast: 'AA',
  },
  {
    id: 'bold',
    label: 'Bold',
    vibe: 'Tighter and more compact, with more on screen at once.',
    group: 'adult',
    order: 3,
    minContrast: 'AA',
  },
  {
    id: 'playful',
    label: 'Playful',
    vibe: 'Livelier, with a little more color and decoration.',
    group: 'adult',
    order: 4,
    minContrast: 'AA',
  },
  // ── Kids spectrum (NN/g age bands) ──────────────────────────────────────────────
  {
    id: 'kids-early',
    label: 'Little (ages 3-5)',
    vibe: 'Large buttons and simple screens for the youngest members.',
    group: 'kids',
    order: 5,
    minContrast: 'AAA',
  },
  {
    id: 'kids-mid',
    label: 'Middle (ages 6-8)',
    vibe: 'Big, friendly type with plenty of breathing room.',
    group: 'kids',
    order: 6,
    minContrast: 'AAA',
  },
  {
    id: 'kids-tween',
    label: 'Tween (ages 9-12)',
    vibe: 'A bit more on screen, still roomy and easy to tap.',
    group: 'kids',
    order: 7,
    minContrast: 'AAA',
  },
]

/** The fallback generation id. An unknown or missing value resolves to this. */
export const DEFAULT_GENERATION: GenerationId = 'balanced'

/** Type guard: is this raw string a known generation id? */
export function isGenerationId(id: string): id is GenerationId {
  return GENERATIONS.some((g) => g.id === id)
}

/**
 * Turn a raw `spaces.generation` / cookie string (or null/undefined) into a safe
 * GenerationId. Returns the id when known, else DEFAULT_GENERATION, so an unrecognized or
 * legacy value never breaks the shell.
 */
export function resolveGeneration(raw: string | null | undefined): GenerationId {
  return raw != null && isGenerationId(raw) ? raw : DEFAULT_GENERATION
}
