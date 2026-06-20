"use client";

import { getAccessToken } from "./client";

/**
 * The token an API call should carry. In standalone mode it's the Supabase
 * session token; in embedded mode the host injects its federated JWT via
 * `setHostToken`, which then takes precedence. One switch, so `authedFetch`
 * stays identical across both modes.
 */
let hostToken: string | null = null;

export function setHostToken(token: string | null): void {
  hostToken = token;
}

export async function getEffectiveToken(): Promise<string | null> {
  if (hostToken) return hostToken;
  return getAccessToken();
}
