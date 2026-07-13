// Airwaves player — public surface. Import from here; the internals (hook, pure core) stay local.
export { AirwavesPlayer } from './airwaves-player'
export type { AirwavesPlayerProps } from './airwaves-player'
export type { PlayerRecording, RecordingChapter, PlayerQueueHandlers } from './types'
export { usePlaybackRate } from './use-playback-rate'
export { PLAYBACK_RATES, type PlaybackRate } from './playback'
