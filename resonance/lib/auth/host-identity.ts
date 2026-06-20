import { jwtVerify, importSPKI } from "jose";

/**
 * The federated-identity trust boundary for embedded mode: the HOST signs, we
 * VERIFY. A host app (Frequency first) issues a short-lived RS256 JWT for its
 * logged-in member; we hold only the matching public key (SPKI PEM in
 * RESONANCE_HOST_JWT_PUBLIC_KEY) and verify the signature here. We never mint
 * host identities ourselves, and we never trust an unverified token.
 *
 * This mirrors `lib/auth/host-jwt.ts` (which the API route layer uses) but
 * returns the shape the embed surface needs: a resolved userId + displayName.
 *
 * Returns null (NEVER throws) when the key is unset or verification fails, so
 * callers can fall back to standalone anonymous identity without env configured.
 */
export async function verifyHostToken(
  token: string,
): Promise<{ userId: string; displayName: string | null } | null> {
  const pem = process.env.RESONANCE_HOST_JWT_PUBLIC_KEY;
  if (!pem) return null;
  try {
    // Tolerate keys stored with escaped newlines (single-line .env values).
    const key = await importSPKI(pem.replace(/\\n/g, "\n"), "RS256");
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.sub !== "string") return null;

    // Claim mapping: `sub` -> userId; `displayName` (contract claim) with
    // `name` as a fallback -> displayName. Anything else is ignored here.
    const claims = payload as Record<string, unknown>;
    const displayName =
      typeof claims.displayName === "string"
        ? claims.displayName
        : typeof claims.name === "string"
          ? claims.name
          : null;

    return { userId: payload.sub, displayName };
  } catch {
    return null;
  }
}
