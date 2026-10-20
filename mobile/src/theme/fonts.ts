// The three Frequency faces (typography.css): Unbounded (500 only, as the members kit sets it) for
// display, numbers and labels; Hanken Grotesk
// for UI and body; Instrument Serif italic for one soft phrase. Only the weights the app uses are
// bundled (per-weight imports, not the package index, which would ship every weight).
import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium'
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular'
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium'
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold'
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold'
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic'

export const fontAssets = {
  Unbounded_500Medium,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  InstrumentSerif_400Regular_Italic,
}
