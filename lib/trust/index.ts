// Public entry point for the Trust layer (ADR-247). A source/vertical emits trust signals
// through a SOURCE ADAPTER — the formal "module hook" the framework calls for: bind a
// source once, then emit signals without repeating the source everywhere. This mirrors how
// engagement events flow (lib/engagement), so a vertical emits trust the same way it emits
// engagement. Trust is reputation, never money.

import { recordTrustSignal, type RecordTrustSignalInput, type RecordTrustSignalResult } from './store'

export * from './store'
export * from './compute'
export { SIGNAL_WEIGHTS, weightFor, isKnownSignal, type TrustContext } from './weights'

/** A source-bound trust emitter. `trustSource('marketplace').signal({ profileId, signalType: 'deal_completed' })`. */
export interface TrustSourceAdapter {
  readonly source: string
  signal(input: Omit<RecordTrustSignalInput, 'source'>): Promise<RecordTrustSignalResult>
}

/** Bind a source id once; returns an adapter whose `.signal()` emits for that source. */
export function trustSource(source: string): TrustSourceAdapter {
  return {
    source,
    signal: (input) => recordTrustSignal({ ...input, source }),
  }
}
