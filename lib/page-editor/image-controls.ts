// Shared image controls for image-bearing blocks: crop ratio, focal point
// (which part of the photo stays in frame when cropped), display size, corner
// radius, and shadow. All token selects → a few Tailwind classes, no image
// processing. Pairs with the optimized <EditorImage> in Phase 3.

const FOCAL: Record<string, string> = {
  center: 'object-center',
  top: 'object-top',
  bottom: 'object-bottom',
  left: 'object-left',
  right: 'object-right',
}

const RADIUS: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-xl',
  md: 'rounded-2xl',
  lg: 'rounded-3xl',
  full: 'rounded-full',
}

const SHADOW: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-xl',
}

// Max-width cap for the image container.
const SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-full',
}

// CSS aspect-ratio value for the crop. 'natural' = no crop (whole photo).
const ASPECT: Record<string, string> = {
  '21/9': '21/9',
  '16/9': '16/9',
  '3/2': '3/2',
  '4/3': '4/3',
  '1/1': '1/1',
  '4/5': '4/5',
}

export const focalField = {
  type: 'select' as const,
  label: 'Focal point (crop keeps this in frame)',
  options: [
    { label: 'Center', value: 'center' },
    { label: 'Top', value: 'top' },
    { label: 'Bottom', value: 'bottom' },
    { label: 'Left', value: 'left' },
    { label: 'Right', value: 'right' },
  ],
}

export const aspectField = {
  type: 'select' as const,
  label: 'Crop ratio',
  options: [
    { label: 'Natural (uncropped)', value: 'natural' },
    { label: 'Cinematic (21:9)', value: '21/9' },
    { label: 'Wide (16:9)', value: '16/9' },
    { label: 'Photo (3:2)', value: '3/2' },
    { label: 'Landscape (4:3)', value: '4/3' },
    { label: 'Square (1:1)', value: '1/1' },
    { label: 'Portrait (4:5)', value: '4/5' },
  ],
}

export const sizeField = {
  type: 'select' as const,
  label: 'Size',
  options: [
    { label: 'Small', value: 'sm' },
    { label: 'Medium', value: 'md' },
    { label: 'Large', value: 'lg' },
    { label: 'Extra large', value: 'xl' },
    { label: 'Full width', value: 'full' },
  ],
}

export const radiusField = {
  type: 'select' as const,
  label: 'Corners',
  options: [
    { label: 'Sharp', value: 'none' },
    { label: 'Rounded', value: 'sm' },
    { label: 'More rounded', value: 'md' },
    { label: 'Pill', value: 'lg' },
    { label: 'Circle', value: 'full' },
  ],
}

export const shadowField = {
  type: 'select' as const,
  label: 'Shadow',
  options: [
    { label: 'None', value: 'none' },
    { label: 'Subtle', value: 'sm' },
    { label: 'Medium', value: 'md' },
    { label: 'Strong', value: 'lg' },
  ],
}

export function focalClass(v?: string): string {
  return FOCAL[v ?? 'center'] ?? 'object-center'
}
export function radiusClass(v?: string, fallback = 'rounded-3xl'): string {
  return v ? (RADIUS[v] ?? fallback) : fallback
}
export function shadowClass(v?: string, fallback = 'shadow-sm'): string {
  return v ? (SHADOW[v] ?? fallback) : fallback
}
export function sizeClass(v?: string, fallback = 'max-w-5xl'): string {
  return v ? (SIZE[v] ?? fallback) : fallback
}
// Returns a CSS aspect-ratio string, or undefined for 'natural'/unset (no crop).
export function aspectValue(v?: string): string | undefined {
  if (!v || v === 'natural') return undefined
  return ASPECT[v]
}
