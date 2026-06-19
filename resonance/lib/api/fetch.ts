"use client";

import { getAccessToken } from "@/lib/auth/client";

/**
 * fetch wrapper that attaches the caller's auth token. Every API call from the
 * client goes through this so the server resolves identity from the verified
 * JWT, never from the request body.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
