import { venueTopic } from "@/lib/sync/channels";

/**
 * Server-authoritative broadcast.
 *
 * The server pushes state changes to subscribers over Supabase Realtime's HTTP
 * broadcast endpoint — no websocket needed server-side. This keeps the SERVER
 * the broadcaster (not whichever client happened to act), so authority and the
 * notification share one origin. Subscribers also reconcile via GET, so a missed
 * broadcast self-heals.
 *
 * Server-only (uses the service role key).
 */
export async function broadcastToVenue(
  venueId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const url = process.env.RESONANCE_SUPABASE_URL;
  const key = process.env.RESONANCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing RESONANCE_SUPABASE_URL or RESONANCE_SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic: venueTopic(venueId), event, payload }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Realtime broadcast failed: ${res.status} ${await res.text()}`);
  }
}
