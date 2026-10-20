// A transport moves raw text to and from a CyberUnicorn. It knows nothing about JSON: the RpcClient
// (client.ts) frames requests and parses lines. Three kinds: USB (OTG, CH340), Bluetooth LE (Bruce's
// serial service) and the internet relay (designed in PROTOCOL.md §6, not built: a placeholder).

export type TransportKind = 'usb' | 'ble' | 'relay'

export type TransportState = 'idle' | 'connecting' | 'connected' | 'error'

export interface Transport {
  readonly kind: TransportKind
  /** A person-readable name for what is connected ("CU5K", "USB Serial"). */
  readonly label: string
  /** Send text exactly as given (the client appends the newline). */
  write(text: string): Promise<void>
  /** Receive decoded text chunks, split anywhere. Returns an unsubscribe. */
  onText(listener: (text: string) => void): () => void
  /** Told when the link drops on its own (cable out, out of range). */
  onClose(listener: (reason: string) => void): () => void
  close(): Promise<void>
}

/** Fan-out helper the transports share. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>()
  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(value: T) {
    for (const l of [...this.listeners]) l(value)
  }
  clear() {
    this.listeners.clear()
  }
}
