"use client";

import { getEffectiveToken } from "@/lib/auth/token";

/**
 * fetch wrapper that attaches the caller's auth token (Supabase session in
 * standalone mode, or the host's federated JWT when embedded). Every API call
 * from the client goes through this so the server resolves identity from the
 * verified JWT, never from the request body.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getEffectiveToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
