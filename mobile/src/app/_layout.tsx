import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { DeviceProvider } from '@/device/DeviceProvider'
import { fontAssets } from '@/theme/fonts'
import { ThemeProvider, fonts, useTheme } from '@/theme'
import { FeedbackProvider } from '@/ui'

SplashScreen.preventAutoHideAsync().catch(() => undefined)

function Navigator() {
  const { c, scheme } = useTheme()
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.canvas },
          headerTintColor: c.textStrong,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 16, color: c.textStrong },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="device/connect" options={{ title: 'Connect', presentation: 'modal' }} />
        <Stack.Screen name="device/light-show" options={{ title: 'Light Show' }} />
        <Stack.Screen name="device/led" options={{ title: 'LED colour' }} />
        <Stack.Screen name="device/sound" options={{ title: 'Sound' }} />
        <Stack.Screen name="device/sensors" options={{ title: 'Sensors' }} />
        <Stack.Screen name="device/remote" options={{ title: 'Screen remote' }} />
        <Stack.Screen name="device/console" options={{ title: 'Console' }} />
        <Stack.Screen name="device/tag-writer" options={{ title: 'Tag writer' }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [loaded, failed] = useFonts(fontAssets)
  useEffect(() => {
    if (loaded || failed) SplashScreen.hideAsync().catch(() => undefined)
  }, [loaded, failed])
  if (!loaded && !failed) return null
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <DeviceProvider>
            <Navigator />
          </DeviceProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
