import crypto from "node:crypto";

/**
 * Server-to-server mirror of gamification events to the host economy (spec §8.2,
 * ADR-010). When embedded, Frequency's Zaps + The Field must stay in sync even
 * when the iframe is closed, so awards are also delivered as HMAC-signed,
 * best-effort webhooks (the host reconciles on retry/failure).
 *
 * No-op (returns immediately) when not configured — i.e. standalone mode.
 */
export async function mirrorToHost(event: {
  type: string;
  [key: string]: unknown;
}): Promise<void> {
  const url = process.env.RESONANCE_HOST_WEBHOOK_URL;
  const secret = process.env.RESONANCE_WEBHOOK_SIGNING_SECRET;
  if (!url || !secret) return;

  const body = JSON.stringify(event);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Resonance-Signature": `sha256=${signature}`,
      },
      body,
    });
  } catch {
    // Best-effort; the host reconciles from its own retries. Never block the loop.
  }
}
