import { jwtVerify, importSPKI } from "jose";
import type { HostIdentityClaims } from "@/lib/integration/embed-contract";

/**
 * Verify a host-issued federated JWT (embedded mode, spec §8.2). The host signs
 * with its private key; we hold only the public key (RS256 SPKI PEM in
 * RESONANCE_HOST_JWT_PUBLIC_KEY). On success we trust `sub` as the user id — no
 * FK, no shared user table (ADR-002). Returns null when not configured or invalid.
 */
export async function verifyHostJwt(token: string): Promise<HostIdentityClaims | null> {
  const pem = process.env.RESONANCE_HOST_JWT_PUBLIC_KEY;
  if (!pem) return null;
  try {
    const key = await importSPKI(pem.replace(/\\n/g, "\n"), "RS256");
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof (payload as Record<string, unknown>).worldId !== "string") {
      return null;
    }
    return payload as unknown as HostIdentityClaims;
  } catch {
    return null;
  }
}
