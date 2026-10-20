import { Tabs } from 'expo-router'
import { Icon, type IconName } from '@/ui'
import { fonts, useTheme } from '@/theme'

// The tab bar. One tab in this layer, the CyberUnicorn remote; the Frequency tab (the member
// experience, docs/MOBILE-APP.md §6) joins it with the screens. Active is shown by colour, as on the web.

const TABS: { name: string; title: string; icon: IconName }[] = [{ name: 'index', title: 'Device', icon: 'sound' }]

export default function TabsLayout() {
  const { c } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.textStrong,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 12 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <Icon name={t.icon} size={size} color={String(color)} /> }}
        />
      ))}
    </Tabs>
  )
}
