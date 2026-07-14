// Email Studio (2026) — the shared, framework-free CONTRACTS for a block-based email.
//
// An email REUSES the unified entity-block model (lib/entity-blocks): its body is an `EntityLayout` with
// kind `'email'`, so the same rows / content / style blob the web page editor produces also drives the email
// renderer (lib/email-studio/render.ts). This module is the stable seam the later UI / send / template /
// analytics agents import: pure types + the curated merge-tag variable list, no React / Next / Supabase.

import type { EntityLayout } from '@/lib/entity-blocks/layout'

/** The editable EMAIL DOCUMENT: the block tree (an EntityLayout with kind `'email'`) plus the subject line
 *  and the preheader (the short preview text a mail client shows beside the subject). The layout is the
 *  source of truth for the body; subject + preheader live alongside it (and on the `campaigns` row when a
 *  campaign owns the doc). Pure data — the editor holds this, the renderer compiles it. */
export interface EmailDoc {
  /** The email body as a block layout (kind `'email'`; single-column). */
  layout: EntityLayout
  /** The subject line (plain text). */
  subject: string
  /** The preview / preheader text shown beside the subject in the inbox (plain text, may be empty). */
  preheader: string
}

/** A saved, reusable EMAIL TEMPLATE — the camelCase mirror of the `email_templates` row (see the migration
 *  supabase/migrations/20261135000000_email_studio.sql). `blockJson` is the template's `EntityLayout` body;
 *  loading a template seeds a fresh EmailDoc. The send / template agents map this to/from the table. */
export interface EmailTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  /** The template body: an `EntityLayout` (kind `'email'`). Stored in `block_json`. */
  blockJson: EntityLayout
  subject: string | null
  preheader: string | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** One curated MERGE-TAG variable the composer offers (the picker UI comes later). `token` is the dotted
 *  name used inside `{{ ... }}` (see applyMergeTags); `label` is the human name; `example` seeds a preview. */
export interface MergeTagVar {
  token: string
  label: string
  example: string
}

/** The CURATED merge-tag variable set (Email Studio Phase 1). Deliberately small + safe: a recipient's
 *  first / last name + email, and the sending Space's name. The picker later renders these; applyMergeTags
 *  substitutes any `{{token}}` at send time. Extend here as the send pipeline resolves more variables. */
export const MERGE_TAG_VARIABLES: readonly MergeTagVar[] = [
  { token: 'contact.first_name', label: 'First name', example: 'Alex' },
  { token: 'contact.last_name', label: 'Last name', example: 'Rivera' },
  { token: 'contact.email', label: 'Email address', example: 'alex@example.com' },
  { token: 'space.name', label: 'Space name', example: 'Riverside Studio' },
  // Product tokens (Email Studio Phase 4). Resolved from the FIRST Product card in the email at send time
  // (lib/email-studio/product-block.ts buildProductVars), so an operator can name a product in the subject
  // or body copy. Each carries a plain fallback below so a blank / missing product still reads naturally.
  { token: 'product.title', label: 'Product name', example: 'Cedar candle' },
  { token: 'product.price', label: 'Product price', example: '$24' },
  { token: 'product.url', label: 'Product link', example: 'https://frequencylocal.com/shop/cedar-candle' },
]

/** The default fallback for the primary merge tag, so a nameless recipient still reads naturally
 *  ("Hi there,"). Used when a `{{contact.first_name}}` carries no inline `| "..."` fallback. */
export const MERGE_TAG_DEFAULT_FALLBACKS: Readonly<Record<string, string>> = {
  'contact.first_name': 'there',
  // Product tokens read naturally even before a product resolves (or when none is placed).
  'product.title': 'our latest',
  'product.price': '',
  'product.url': '',
}
