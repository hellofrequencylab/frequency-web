/** The five creator steps, in order (docs/hunts/CREATOR-FLOW.md). Step 1 is /hunts/new; the rest are the editor. */
export const TRAIL_STEPS = ['Name it', 'Add stops', 'Choose the shape', 'Preview', 'Publish'] as const

export type EditorStep = 'stops' | 'shape' | 'preview' | 'publish'

export const EDITOR_STEPS: readonly EditorStep[] = ['stops', 'shape', 'preview', 'publish']

/** 1-indexed position of an editor step in the five, for the progress bar. */
export const stepNumber = (step: EditorStep): number => EDITOR_STEPS.indexOf(step) + 2
