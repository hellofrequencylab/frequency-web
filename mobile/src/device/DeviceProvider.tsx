import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DeviceError, RpcClient, type LogLine } from './client'
import type { Command, DeviceEvent } from './protocol'
import type { SystemStatus } from './types'
import type { Transport, TransportKind, TransportState } from './transport'

// One connected CyberUnicorn for the whole app. Screens call `call()`; the console reads `log`;
// Light Show listens to `events`. A dropped link (cable out, out of range) resets to idle with the
// reason, so the Device tab can offer to reconnect.

type DeviceContextValue = {
  state: TransportState
  kind: TransportKind | null
  label: string | null
  error: string | null
  status: SystemStatus | null
  log: LogLine[]
  attach: (open: () => Promise<Transport>) => Promise<void>
  disconnect: () => Promise<void>
  call: <T = Record<string, unknown>>(cmd: Command, args?: Record<string, unknown>) => Promise<T>
  refreshStatus: () => Promise<void>
  onEvent: (listener: (e: DeviceEvent) => void) => () => void
  clearLog: () => void
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

const MAX_LOG = 400

export function DeviceProvider({ children }: { children: ReactNode }) {
  const client = useRef<RpcClient | null>(null)
  const [state, setState] = useState<TransportState>('idle')
  const [kind, setKind] = useState<TransportKind | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [log, setLog] = useState<LogLine[]>([])

  const pushLog = useCallback((line: LogLine) => {
    setLog((prev) => (prev.length >= MAX_LOG ? [...prev.slice(prev.length - MAX_LOG + 1), line] : [...prev, line]))
  }, [])

  const reset = useCallback((reason: string | null) => {
    client.current = null
    setState(reason ? 'error' : 'idle')
    setError(reason)
    setKind(null)
    setLabel(null)
    setStatus(null)
  }, [])

  const call = useCallback(<T,>(cmd: Command, args?: Record<string, unknown>): Promise<T> => {
    const c = client.current
    if (!c) return Promise.reject(new DeviceError('disconnected'))
    return c.call<T>(cmd, args)
  }, [])

  const refreshStatus = useCallback(async () => {
    setStatus(await call<SystemStatus>('system.status'))
  }, [call])

  const attach = useCallback(
    async (open: () => Promise<Transport>) => {
      await client.current?.close().catch(() => undefined)
      client.current = null
      setState('connecting')
      setError(null)
      try {
        const transport = await open()
        const c = new RpcClient(transport)
        c.log.on(pushLog)
        transport.onClose((reason) => {
          if (client.current === c) reset(reason)
        })
        client.current = c
        setKind(transport.kind)
        setLabel(transport.label)
        setState('connected')
        // The board may have just booted (a cable wiggle resets it): retry the hello a few times.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            setStatus(await c.call<SystemStatus>('system.status'))
            break
          } catch (e) {
            if (!(e instanceof DeviceError) || e.code !== 'timeout') break
          }
        }
      } catch (e) {
        reset(e instanceof Error ? e.message : 'Could not connect.')
      }
    },
    [pushLog, reset],
  )

  const disconnect = useCallback(async () => {
    const c = client.current
    client.current = null
    await c?.close().catch(() => undefined)
    reset(null)
  }, [reset])

  const onEvent = useCallback((listener: (e: DeviceEvent) => void) => {
    const c = client.current
    return c ? c.events.on(listener) : () => undefined
  }, [])

  useEffect(() => () => void client.current?.close().catch(() => undefined), [])

  const value = useMemo<DeviceContextValue>(
    () => ({ state, kind, label, error, status, log, attach, disconnect, call, refreshStatus, onEvent, clearLog: () => setLog([]) }),
    [state, kind, label, error, status, log, attach, disconnect, call, refreshStatus, onEvent],
  )
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice(): DeviceContextValue {
  const v = useContext(DeviceContext)
  if (!v) throw new Error('useDevice outside DeviceProvider')
  return v
}

/** Run one command with busy and error state for a screen. */
export function useDeviceAction() {
  const { call } = useDevice()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(
    async <T,>(cmd: Command, args?: Record<string, unknown>): Promise<T | null> => {
      setBusy(cmd)
      setError(null)
      try {
        return await call<T>(cmd, args)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return null
      } finally {
        setBusy(null)
      }
    },
    [call],
  )
  return { run, busy, error, setError }
}
