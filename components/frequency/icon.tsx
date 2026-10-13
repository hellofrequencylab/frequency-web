// THE FREQUENCY ICON (ADR-1740). One component over the design system's sprite
// (public/brand/frequency/frequency-icons.svg, installed by `pnpm design:install`): every symbol is 24x24
// with stroke="currentColor", so colour comes from the text colour and size from the class. Server-safe,
// no client JS. The kit CSS styles `.fq-icon` and `.fq-icon-tile`.

export type FqIconName =
  | 'qr'  | 'contacts'  | 'nudge'  | 'membership'  | 'ticket'  | 'program'  | 'page'  | 'circle'  | 'event'  | 'checkin'  | 'zap'  | 'gem'  | 'host'  | 'space'  | 'standing'  | 'pin'  | 'message'  | 'search'  | 'tip'  | 'breath'  | 'arrow'  | 'home'  | 'compass'  | 'user'  | 'settings'  | 'help'  | 'map'  | 'filter'  | 'clock'  | 'share'  | 'invite'  | 'link'  | 'streak'  | 'award'  | 'trophy'  | 'goal'  | 'podium'  | 'vault'  | 'wallet'  | 'chart'  | 'shield'  | 'flag'  | 'edit'  | 'photo'  | 'camera'  | 'tag'  | 'lesson'  | 'practice'  | 'moon'  | 'sun'  | 'sound'  | 'door'  | 'crew'  | 'vera'  | 'giveback'  | 'plus'  | 'close'  | 'check'  | 'chevron'  | 'more'  | 'send'  | 'globe'  | 'download'  | 'upload'  | 'house-01'  | 'house-02'  | 'house-03'  | 'house-04'  | 'house-05'  | 'house-06'  | 'house-07'  | 'house-08'  | 'house-09'  | 'house-10'  | 'house-11'  | 'house-12'

const SPRITE = '/brand/frequency/frequency-icons.svg'

export function FqIcon({
  name,
  className,
  label,
  size,
}: {
  name: FqIconName
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
      <use href={`${SPRITE}#${name}`} />
    </svg>
  )
}
