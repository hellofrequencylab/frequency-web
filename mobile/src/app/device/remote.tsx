import { useEffect, useState } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import type { AppsList } from '@/device/types'
import { radius, shadow, useTheme } from '@/theme'
import { Badge, Icon, Meta, Notice, Panel, SectionHeader, usePressScale, type IconName } from '@/ui'

// A D-pad for the device's own screen: `screen.nav {key: prev|next|sel|esc}`, one press each, the way
// Bruce's `nav` command and its web UI press them. Select is the pastel primary; the rest are raised
// keys with the kit's press. The main menu below is `apps.list`.

type Key = 'prev' | 'next' | 'sel' | 'esc'

function Pad({ k, icon, label, rotate, run, primary }: { k: Key; icon: IconName; label: string; rotate?: string; run: (k: Key) => void; primary?: boolean }) {
  const { c } = useTheme()
  const press = usePressScale(0.94)
  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        onPress={() => run(k)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.pad,
          primary
            ? { backgroundImage: `linear-gradient(120deg, ${c.pa[0]} 0%, ${c.pa[1]} 60%, ${c.pa[2]} 100%)`, boxShadow: `0px 12px 28px -14px ${c.paGlow}, inset 0px 0px 0px 1px ${c.paRim}` }
            : { backgroundColor: c.raised, boxShadow: `${shadow.card}, inset 0px 0px 0px 1px ${c.border}` },
        ]}
      >
        <View style={rotate ? { transform: [{ rotate }] } : undefined}>
          <Icon name={icon} size={28} color={primary ? c.onPa : c.textStrong} />
        </View>
        <Meta color={primary ? c.onPa : c.textMuted}>{label}</Meta>
      </Pressable>
    </Animated.View>
  )
}

export default function Remote() {
  const { call } = useDevice()
  const { run, error } = useDeviceAction()
  const [apps, setApps] = useState<AppsList['apps']>()
  const press = (key: Key) => void run('screen.nav', { key })

  useEffect(() => {
    call<AppsList>('apps.list').then(
      (a) => setApps(a.apps),
      () => undefined,
    )
  }, [call])

  return (
    <DeviceScreen>
      <Panel style={{ alignItems: 'center' }} gap={16}>
        <Pad k="prev" icon="chevron" rotate="-90deg" label="Previous" run={press} />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pad k="esc" icon="close" label="Back" run={press} />
          <Pad k="sel" icon="check" label="Select" run={press} primary />
          <View style={{ width: 88 }} />
        </View>
        <Pad k="next" icon="chevron" rotate="90deg" label="Next" run={press} />
      </Panel>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      {apps?.length ? (
        <View style={{ gap: 14 }}>
          <SectionHeader title="Main menu" count={apps.filter((a) => !a.hidden).length} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {apps
              .filter((a) => !a.hidden)
              .map((a) => (
                <Badge key={a.name} label={a.name} />
              ))}
          </View>
        </View>
      ) : null}
    </DeviceScreen>
  )
}

const styles = StyleSheet.create({
  pad: { width: 88, height: 88, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center', gap: 4 },
})
