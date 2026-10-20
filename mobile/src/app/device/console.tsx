import { useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native'
import { Mono, Meta } from '@/components/text'
import { Button, Notice, Segmented } from '@/components/ui'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import type { CliResult } from '@/device/types'
import { fonts, gutter, radius, space, useTheme } from '@/theme'

// The raw console: run any Bruce CLI line through `cli.run {line}` and see what it printed, or watch
// the whole serial stream (protocol lines and Bruce's own logs). For when a button does not exist yet.

type View_ = 'output' | 'stream'

export default function Console() {
  const { c } = useTheme()
  const { log, clearLog, state } = useDevice()
  const { run, busy, error } = useDeviceAction()
  const [line, setLine] = useState('')
  const [view, setView] = useState<View_>('output')
  const [out, setOut] = useState<{ cmd: string; text: string }[]>([])
  const list = useRef<FlatList>(null)

  const submit = async () => {
    const cmd = line.trim()
    if (!cmd) return
    setLine('')
    const r = await run<CliResult>('cli.run', { line: cmd })
    if (r) setOut((prev) => [...prev, { cmd, text: `${r.output ?? ''}${r.truncated ? '\n… (cut at 2 KB)' : ''}${r.result === false ? '\n(not a command)' : ''}` }])
  }

  const rows = view === 'output' ? out.map((o, i) => ({ key: String(i), text: `# ${o.cmd}\n${o.text.trimEnd()}` })) : log.map((l, i) => ({ key: String(i), text: `${l.dir === 'out' ? '→ ' : l.dir === 'note' ? '· ' : ''}${l.text}` }))

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ padding: gutter, gap: space[4], flex: 1 }}>
        <Segmented<View_>
          value={view}
          onChange={setView}
          options={[
            { value: 'output', label: 'Commands' },
            { value: 'stream', label: 'Serial stream' },
          ]}
        />
        {state !== 'connected' ? <Notice tone="info">Not connected.</Notice> : null}
        {error ? <Notice tone="live">{error}</Notice> : null}
        <View style={[styles.screen, { backgroundColor: c.sunken, borderColor: c.border }]}>
          <FlatList
            ref={list}
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={({ item }) => <Mono selectable>{item.text}</Mono>}
            ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Meta>{view === 'output' ? 'Try "info" or "help".' : 'Nothing on the wire yet.'}</Meta>}
          />
        </View>
        {view === 'stream' ? <Button variant="ghost" compact label="Clear" onPress={clearLog} /> : null}
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <TextInput
            value={line}
            onChangeText={setLine}
            onSubmitEditing={submit}
            placeholder="Bruce command"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            accessibilityLabel="Bruce command"
            style={[styles.input, { borderColor: c.borderStrong, backgroundColor: c.raised, color: c.textStrong }]}
          />
          <Button compact label="Run" busy={busy === 'cli.run'} disabled={!line.trim() || state !== 'connected'} onPress={submit} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, padding: space[5] },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space[5], fontFamily: fonts.sans },
})
