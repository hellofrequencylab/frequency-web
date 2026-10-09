#!/usr/bin/env node
// Read-only inventory of real outbound boundaries. Includes Supabase-owned authentication mail.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
export function emailSenderInventory(root = '.') {
  const results = []
  function walk(dir) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        const text = readFileSync(join(root, path), 'utf8')
        if (!/sendRawEmail|enqueueEmail|\b(?:emails|auth|enqueue)\b/.test(text)) continue
        const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
        function visit(node) {
          if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(source)
            const arg = node.arguments[0]
            const queueKind = arg && ts.isStringLiteral(arg) ? arg.text : null
            let boundary = null
            if (/(?:^|\.)(sendRawEmail|enqueueEmail)$/.test(callee)) boundary = callee.endsWith('sendRawEmail') ? 'provider-helper' : 'durable-email-helper'
            else if (callee === 'enqueue' && ['email', 'space-campaign-email'].includes(queueKind)) boundary = 'direct-email-outbox'
            else if (callee === 'enqueue' && queueKind === null && /SPACE_CAMPAIGN_EMAIL_KIND/.test(arg?.getText(source) ?? '')) boundary = 'space-campaign-outbox'
            else if (/\.emails\.send$/.test(callee)) boundary = 'resend-provider'
            else if (/\.auth\.(signInWithOtp|resetPasswordForEmail|signUp|inviteUserByEmail)$/.test(callee) || /\.auth\.admin\.inviteUserByEmail$/.test(callee)) boundary = 'supabase-auth-mail'
            if (boundary) {
              let owner = node.parent
              while (owner && !ts.isFunctionDeclaration(owner) && !ts.isMethodDeclaration(owner) && !ts.isArrowFunction(owner)) owner = owner.parent
              results.push({ file: path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, owner: owner?.name?.getText(source) ?? (owner && ts.isArrowFunction(owner) && ts.isVariableDeclaration(owner.parent) ? owner.parent.name.getText(source) : '<anonymous>'), boundary, callee })
            }
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
      }
    }
  }
  walk('lib'); walk('app')
  return results.sort((a,b) => a.file.localeCompare(b.file) || a.line-b.line)
}
if (process.argv[1]?.endsWith('email-sender-inventory.mjs')) console.log(JSON.stringify(emailSenderInventory(), null, 2))
