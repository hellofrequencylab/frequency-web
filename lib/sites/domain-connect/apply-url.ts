// THE SIGNED SYNCHRONOUS APPLY URL (LIVE-780). Where the "Connect with <provider>" button sends a
// Space owner: the provider's own page, which asks them to sign in and approve Frequency's template
// for their domain, then sends them back to `redirect_uri`. PURE apart from the RSA signature.
//
// Shape (Domain Connect spec, synchronous flow):
//   {urlSyncUX}/v2/domainTemplates/providers/{providerId}/services/{serviceId}/apply
//     ?domain=…&<template variables>&redirect_uri=…&state=…&sig=<base64 RSA-SHA256 of the query>&key=_dck1
// `sig` and `key` come last, and the signature covers exactly the query string before them.

import type { KeyObject } from 'node:crypto'
import { DC_KEY_HOST, DC_PROVIDER_ID, DC_SERVICE_ID } from './constants'
import { signQuery } from './signer'

export interface ApplyUrlInput {
  /** The provider's synchronous UX base, from its Domain Connect settings (https, no trailing slash needed). */
  urlSyncUX: string
  /** The apex domain the template is applied to. */
  domain: string
  /** The template's variables, by name without the `%` marks (here `ip` and `target`). */
  variables: Record<string, string>
  redirectUri: string
  state: string
  privateKey: KeyObject
}

/** The unsigned query string, in a fixed order so the signature is reproducible. */
export function applyQuery(input: Pick<ApplyUrlInput, 'domain' | 'variables' | 'redirectUri' | 'state'>): string {
  const params = new URLSearchParams()
  params.set('domain', input.domain)
  for (const name of Object.keys(input.variables).sort()) params.set(name, input.variables[name])
  params.set('redirect_uri', input.redirectUri)
  params.set('state', input.state)
  return params.toString()
}

/** Build the full signed apply URL. */
export function buildApplyUrl(input: ApplyUrlInput): string {
  const base = input.urlSyncUX.replace(/\/+$/, '')
  const path = `/v2/domainTemplates/providers/${encodeURIComponent(DC_PROVIDER_ID)}/services/${encodeURIComponent(DC_SERVICE_ID)}/apply`
  const query = applyQuery(input)
  const sig = signQuery(query, input.privateKey)
  return `${base}${path}?${query}&sig=${encodeURIComponent(sig)}&key=${encodeURIComponent(DC_KEY_HOST)}`
}
