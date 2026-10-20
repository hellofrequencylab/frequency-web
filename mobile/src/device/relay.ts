// INTERNET RELAY: coming soon. The design is cyberpunkunicorn-os/apps/remote/PROTOCOL.md §6: the phone
// and the device meet on a private Supabase Realtime channel `device:<id>` and pass the same `rpc` /
// `@rpc` / `@evt` lines as broadcasts, so this transport will reuse RpcClient unchanged. It needs
// frequency-web to add `POST /api/v1/devices/realtime-token`, Realtime RLS on `realtime.messages`,
// device ownership and `GET /api/v1/me/devices` first. Until then the picker shows it, disabled.

export const relayAvailable = false

export const RELAY_COMING_SOON =
  'Control your CyberUnicorn from anywhere, through Frequency. Coming soon: it needs the device relay on the server first.'
