import { Image } from 'react-native'
import { useTheme } from '@/theme'

// The Frequency marks (design_handoff/frequency/assets/logo). Used as masks: the PNG's alpha is the
// shape and the ink is the theme's strongest text, the native twin of the web's `.fq-logo` mask.

const WORDMARK = require('../../assets/brand/frequency-wordmark.png')
const ROUND = require('../../assets/brand/frequency-icon-round.png')

export function Wordmark({ height = 22 }: { height?: number }) {
  const { c } = useTheme()
  return (
    <Image
      source={WORDMARK}
      accessibilityLabel="Frequency"
      style={{ height, width: (height * 1920) / 389, tintColor: c.textStrong }}
      resizeMode="contain"
    />
  )
}

export function RoundMark({ size = 40 }: { size?: number }) {
  const { c } = useTheme()
  return <Image source={ROUND} accessibilityLabel="Frequency" style={{ width: size, height: size, tintColor: c.textStrong }} resizeMode="contain" />
}
