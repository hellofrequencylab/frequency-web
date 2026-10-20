import { SvgXml } from 'react-native-svg'
import { ICONS, type IconName } from '@/theme/icons.generated'
import { useTheme } from '@/theme'

export type { IconName }

/** One Frequency icon (24px grid, 1.75 stroke), drawn in `color` (default: body ink). */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme()
  return <SvgXml xml={ICONS[name]} width={size} height={size} color={color ?? c.text} />
}
