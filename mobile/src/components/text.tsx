import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { fonts, type, useTheme } from '@/theme'

// The type roles. Unbounded carries display, numbers and labels; Hanken Grotesk carries everything a
// person reads; Instrument Serif italic is for one soft phrase per screen at most.

type Props = TextProps & { color?: string; align?: TextStyle['textAlign'] }

function make(base: (c: ReturnType<typeof useTheme>['c']) => TextStyle, defaults?: Partial<TextProps>) {
  return function Role({ style, color, align, ...rest }: Props) {
    const { c } = useTheme()
    return <RNText {...defaults} {...rest} style={[base(c), color ? { color } : null, align ? { textAlign: align } : null, style]} />
  }
}

export const Title = make((c) => ({ fontFamily: fonts.display, color: c.textStrong, ...type.h1 }), { accessibilityRole: 'header' })
export const Heading = make((c) => ({ fontFamily: fonts.display, color: c.textStrong, ...type.h2 }), { accessibilityRole: 'header' })
export const Subheading = make((c) => ({ fontFamily: fonts.sansBold, color: c.textStrong, ...type.h3 }))
export const Body = make((c) => ({ fontFamily: fonts.sans, color: c.text, ...type.body }))
export const BodySmall = make((c) => ({ fontFamily: fonts.sans, color: c.text, ...type.bodyS }))
export const Meta = make((c) => ({ fontFamily: fonts.sansMedium, color: c.textMuted, ...type.meta }))
/** `--type-label`: Unbounded 11px, tracked, uppercase. Eyebrows and tile labels. */
export const Label = make((c) => ({ fontFamily: fonts.displayMedium, color: c.textMuted, textTransform: 'uppercase', ...type.label }))
/** Big game numbers: Unbounded, tabular. */
export const Count = make((c) => ({ fontFamily: fonts.displayBold, color: c.textStrong, fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] }))
export const Serif = make((c) => ({ fontFamily: fonts.serifItalic, color: c.textStrong, ...type.serifM }))
export const Mono = make((c) => ({ fontFamily: 'monospace', color: c.text, fontSize: 12, lineHeight: 17 }))
