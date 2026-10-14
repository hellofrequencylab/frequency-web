// THE FREQUENCY ICON (ADR-1740). One component over the design system's sprite
// (public/brand/frequency/frequency-icons.svg, installed by `pnpm design:install`): every symbol is 24x24
// with stroke="currentColor", so colour comes from the text colour and size from the class. Server-safe,
// no client JS. The kit CSS styles `.fq-icon` and `.fq-icon-tile`.

export type FqIconName =
  | 'qr'  | 'contacts'  | 'nudge'  | 'membership'  | 'ticket'  | 'program'  | 'page'  | 'circle'  | 'event'  | 'checkin'  | 'zap'  | 'gem'  | 'host'  | 'space'  | 'standing'  | 'pin'  | 'message'  | 'search'  | 'tip'  | 'breath'  | 'arrow'  | 'home'  | 'compass'  | 'user'  | 'settings'  | 'help'  | 'map'  | 'filter'  | 'clock'  | 'share'  | 'invite'  | 'link'  | 'streak'  | 'award'  | 'trophy'  | 'goal'  | 'podium'  | 'vault'  | 'wallet'  | 'chart'  | 'shield'  | 'flag'  | 'edit'  | 'photo'  | 'camera'  | 'tag'  | 'lesson'  | 'practice'  | 'moon'  | 'sun'  | 'sound'  | 'door'  | 'crew'  | 'vera'  | 'giveback'  | 'plus'  | 'close'  | 'check'  | 'chevron'  | 'more'  | 'send'  | 'globe'  | 'download'  | 'upload'  | 'house-01'  | 'house-02'  | 'house-03'  | 'house-04'  | 'house-05'  | 'house-06'  | 'house-07'  | 'house-08'  | 'house-09'  | 'house-10'  | 'house-11'  | 'house-12'

/** The page editor's own glyphs (undo, redo, devices, folds, section toolbar). The export draws them inline in
 *  templates/admin/editor/editor.js; they live in a HAND-KEPT supplementary sprite beside the generated one,
 *  because the installer copies frequency-icons.svg verbatim and would drop anything added to it. */
export const FQ_EDITOR_ICONS = ['undo', 'redo', 'eye', 'eye-off', 'desktop', 'tablet', 'phone', 'arrow-up', 'arrow-down', 'copy', 'trash', 'fold-left', 'fold-right', 'back', 'caret', 'minus', 'layers', 'palette'] as const
export type FqEditorIconName = (typeof FQ_EDITOR_ICONS)[number]

const SPRITE = '/brand/frequency/frequency-icons.svg'
const EDITOR_SPRITE = '/brand/frequency/frequency-editor-icons.svg'
const EDITOR_SET: ReadonlySet<string> = new Set(FQ_EDITOR_ICONS)

export function FqIcon({
  name,
  className,
  label,
  size,
}: {
  name: FqIconName | FqEditorIconName
  className?: string
  /** An accessible name. Omit for a decorative icon beside text (the default). */
  label?: string
  /** Pixel size; the default is the sprite's 24. */
  size?: number
}) {
  return (
    <svg
      className={className ? `fq-icon ${className}` : 'fq-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`${EDITOR_SET.has(name) ? EDITOR_SPRITE : SPRITE}#${name}`} />
    </svg>
  )
}
