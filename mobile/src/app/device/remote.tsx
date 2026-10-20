import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { Icon, type IconName } from '@/components/icon'
import { Section } from '@/components/screen'
import { Body, Meta } from '@/components/text'
import { Card, Notice } from '@/components/ui'
import { useDeviceAction } from '@/device/DeviceProvider'
import type { AppsList } from '@/device/types'
import { hitMin, radius, shadow, space, useTheme } from '@/theme'

// A D-pad for the device's own screen: `screen.nav {key: prev|next|sel|esc}`, one button press each,
// the way Bruce's `nav` command and its web UI press them. The app list is `apps.list`.

type Key = 'prev' | 'next' | 'sel' | 'esc'

function Pad({ k, icon, label, rotate, run, primary }: { k: Key; icon: IconName; label: string; rotate?: string; run: (k: Key) => void; primary?: boolean }) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={() => run(k)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pad,
        shadow[1],
        { backgroundColor: primary ? c.action : c.raised, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={rotate ? { transform: [{ rotate }] } : undefined}>
        <Icon name={icon} size={28} color={primary ? c.actionText : c.textStrong} />
      </View>
      <Meta color={primary ? c.actionText : c.textMuted}>{label}</Meta>
    </Pressable>
  )
}

export default function Remote() {
  const { run, error } = useDeviceAction()
  const [apps, setApps] = useState<AppsList['apps']>()
  const press = (key: Key) => void run('screen.nav', { key })

  useEffect(() => {
    run<AppsList>('apps.list').then((a) => a && setApps(a.apps))
  }, [run])

  return (
    <DeviceScreen>
      <Card style={{ alignItems: 'center', gap: space[5] }}>
        <Pad k="prev" icon="chevron" rotate="-90deg" label="Previous" run={press} />
        <View style={{ flexDirection: 'row', gap: space[5] }}>
          <Pad k="esc" icon="close" label="Back" run={press} />
          <Pad k="sel" icon="check" label="Select" run={press} primary />
          <View style={{ width: 88 }} />
        </View>
        <Pad k="next" icon="chevron" rotate="90deg" label="Next" run={press} />
      </Card>
      {error ? <Notice tone="live">{error}</Notice> : null}
      {apps?.length ? (
        <Section title="On the main menu" count={apps.filter((a) => !a.hidden).length}>
          <Card>
            {apps
              .filter((a) => !a.hidden)
              .map((a) => (
                <Body key={a.name}>{a.name}</Body>
              ))}
          </Card>
        </Section>
      ) : null}
    </DeviceScreen>
  )
}

const styles = StyleSheet.create({
  pad: {
    width: 88,
    height: 88,
    minHeight: hitMin,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
})
