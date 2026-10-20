import { useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import type { CliResult } from '@/device/types'
import { gutter, radius, useTheme } from '@/theme'
import { Button, Field, IconButton, Meta, Mono, Notice, SegmentedControl, useConfirm } from '@/ui'

// The raw console: run any Bruce CLI line through `cli.run {line}` and read what it printed, or watch the
// whole serial stream (protocol lines and Bruce's own logs). For when a button does not exist yet.

type Tab = 'output' | 'stream'

export default function Console() {
  const { c } = useTheme()
  const confirm = useConfirm()
  const { log, clearLog, state } = useDevice()
  const { run, busy, error } = useDeviceAction()
  const [line, setLine] = useState('')
  const [tab, setTab] = useState<Tab>('output')
  const [out, setOut] = useState<{ cmd: string; text: string }[]>([])
  const list = useRef<FlatList>(null)

  const submit = async () => {
    const cmd = line.trim()
    if (!cmd) return
    setLine('')
    const r = await run<CliResult>('cli.run', { line: cmd })
    if (r) setOut((prev) => [...prev, { cmd, text: `${r.output ?? ''}${r.truncated ? '\n(cut at 2 KB)' : ''}${r.result === false ? '\n(not a command)' : ''}` }])
  }

  const clear = async () => {
    if (await confirm({ title: 'Clear the console?', body: 'This only clears the phone’s copy. Nothing on the device changes.', confirm: 'Clear', variant: 'ink' })) {
      if (tab === 'stream') clearLog()
      else setOut([])
    }
  }

  const rows =
    tab === 'output'
      ? out.map((o, i) => ({ key: String(i), text: `# ${o.cmd}\n${o.text.trimEnd()}` }))
      : log.map((l, i) => ({ key: String(i), text: `${l.dir === 'out' ? '→ ' : l.dir === 'note' ? '· ' : ''}${l.text}` }))

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ padding: gutter, gap: 14, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SegmentedControl<Tab>
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'output', label: 'Commands' },
                { value: 'stream', label: 'Serial stream' },
              ]}
            />
          </View>
          <IconButton icon="close" label="Clear the console" variant="bordered" onPress={clear} />
        </View>
        {state !== 'connected' ? <Notice tone="info">Not connected.</Notice> : null}
        {error ? <Notice tone="broadcast">{error}</Notice> : null}
        <View style={{ flex: 1, borderRadius: radius.m, backgroundColor: c.fill, padding: 16 }}>
          <FlatList
            ref={list}
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={({ item }) => <Mono selectable>{item.text}</Mono>}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Meta>{tab === 'output' ? 'Try info or help.' : 'Nothing on the wire yet.'}</Meta>}
          />
        </View>
        <Field
          label="Bruce command"
          value={line}
          onChangeText={setLine}
          onSubmitEditing={submit}
          placeholder="info"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          trailing={<Button variant="primary" label="Run" loading={busy === 'cli.run'} disabled={!line.trim() || state !== 'connected'} onPress={submit} />}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
