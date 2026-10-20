import { Tabs } from 'expo-router'
import { Icon, type IconName } from '@/components/icon'
import { fonts, useTheme } from '@/theme'

// Four tabs, one job each: Home (you), Rewards (your cards), Check in (show up), Device (your gadget).
// Active is shown by colour, as on the web's tab bar.

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'rewards', title: 'Rewards', icon: 'award' },
  { name: 'check-in', title: 'Check in', icon: 'checkin' },
  { name: 'device', title: 'Device', icon: 'sound' },
]

export default function TabsLayout() {
  const { c } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
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
