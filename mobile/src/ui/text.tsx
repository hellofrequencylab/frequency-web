import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { fonts, type, useTheme } from '@/theme'

// The type roles of the members kit. Unbounded (500 only, never bold or caps outside labels) carries
// titles, numbers and `.k` labels; Hanken Grotesk carries everything a person reads; Instrument Serif
// italic is for one soft phrase per screen at most.

type Props = TextProps & { color?: string; align?: TextStyle['textAlign'] }
type Palette = ReturnType<typeof useTheme>['c']

function role(base: (c: Palette) => TextStyle, defaults?: Partial<TextProps>) {
  return function Role({ style, color, align, ...rest }: Props) {
    const { c } = useTheme()
    return <RNText {...defaults} {...rest} style={[base(c), color ? { color } : null, align ? { textAlign: align } : null, style]} />
  }
}

/** Page title. */
export const Title = role((c) => ({ fontFamily: fonts.display, color: c.textStrong, ...type.h1 }), { accessibilityRole: 'header' })
/** `.h2`: a section title. */
export const Heading = role((c) => ({ fontFamily: fonts.display, color: c.textStrong, ...type.h2 }), { accessibilityRole: 'header' })
/** `.h3`: a card title. */
export const Subheading = role((c) => ({ fontFamily: fonts.display, color: c.textStrong, ...type.h3 }))
export const Body = role((c) => ({ fontFamily: fonts.sans, color: c.text, ...type.body }))
export const BodySmall = role((c) => ({ fontFamily: fonts.sans, color: c.text, ...type.bodyS }))
/** `.t2` / `.meta`: muted, 13px. */
export const Meta = role((c) => ({ fontFamily: fonts.sans, color: c.textMuted, ...type.meta }))
/** `.k`: Unbounded 500 11px, tracked .14em, uppercase. Eyebrows and tile labels. */
export const Label = role((c) => ({ fontFamily: fonts.display, color: c.textMuted, textTransform: 'uppercase', ...type.label }))
/** A big game or sensor number: Unbounded 500, tabular. */
export const Count = role((c) => ({ fontFamily: fonts.display, color: c.textStrong, fontSize: 28, lineHeight: 32, letterSpacing: -1.1, fontVariant: ['tabular-nums'] }))
export const Serif = role((c) => ({ fontFamily: fonts.serifItalic, color: c.textStrong, ...type.serif }))
export const Mono = role((c) => ({ fontFamily: 'monospace', color: c.text, fontSize: 12, lineHeight: 17 }))
