// Actual Expo consumers for future supported dependency repairs. These bounded compatibility
// checks do NOT remediate GHSA-mrhx-c7xc-m3w5 or GHSA-86w9-cpqp-85rv (SEC-004 stays open).
const { test } = require('node:test');
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { generateKeyPairSync, verify, constants } = require('node:crypto');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const cliRoot = path.dirname(expoRequire.resolve('@expo/cli/package.json'));
const schemas = cliRequire(path.join(cliRoot, 'build/src/start/server/DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = cliRequire(path.join(cliRoot, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'));
const certificates = cliRequire('@expo/code-signing-certificates');

// Nothing is read from Expo credentials, user settings, project secrets, network or device stores.
const plugin = { packageName: 'synthetic-fixture', packageRoot: '/synthetic', cliExtensions: {
  description: 'Synthetic compatibility fixture', entryPoint: 'index.js', commands: [{
    name: 'inspect', title: 'Inspect', environments: ['mcp'], parameters: [
      { name: 'message', type: 'text' }, { name: 'count', type: 'number' }, { name: 'confirmed', type: 'confirm' },
    ],
  }],
} };

test('actual Expo plugin and generated MCP schemas retain valid/invalid behavior', () => {
  const parsed = schemas.PluginSchema.parse(plugin);
  const schema = createMCPDevToolsExtensionSchema(parsed);
  assert.equal(schema.safeParse({ command: 'inspect', message: 'hello', count: 2, confirmed: true }).success, true);
  for (const invalid of [{ command: 'other' }, { command: 'inspect', count: 'two' }, { command: 'inspect', extra: true }]) {
    assert.equal(schema.safeParse(invalid).success, false);
  }
  assert.equal(schemas.PluginSchema.safeParse({ ...plugin, cliExtensions: { ...plugin.cliExtensions, commands: [] } }).success, false);
});

test('actual Expo output schema rejects invalid collection elements on bounded input', () => {
  assert.equal(schemas.DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'ok', level: 'info' }]).success, true);
  assert.equal(schemas.DevToolsPluginOutputSchema.safeParse(Array.from({ length: 64 }, () => ({ type: 'text', text: 'ok', level: 'invalid' }))).success, false);
  // No OOM attempt: rejection does not establish bounded parsing resources on adversarial arrays.
});

function fixture() {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const keyPair = certificates.convertKeyPairPEMToKeyPair({ publicKeyPEM: pem.publicKey, privateKeyPEM: pem.privateKey });
  const now = Date.now();
  const certificate = certificates.generateSelfSignedCodeSigningCertificate({ keyPair, commonName: 'Synthetic local fixture',
    validityNotBefore: new Date(now - 60000), validityNotAfter: new Date(now + 60000) });
  return { pem, keyPair, certificate };
}

test('actual Expo signing round-trips synthetic PEM and agrees with Node signature verification', () => {
  const { pem, keyPair, certificate } = fixture();
  const roundTrip = certificates.convertCertificatePEMToCertificate(certificates.convertCertificateToCertificatePEM(certificate));
  assert.doesNotThrow(() => certificates.validateSelfSignedCertificate(roundTrip, keyPair));
  const payload = Buffer.from('synthetic local manifest');
  const signature = Buffer.from(certificates.signBufferRSASHA256AndVerify(keyPair.privateKey, roundTrip, payload), 'base64');
  const publicKey = { key: pem.publicKey, padding: constants.RSA_PKCS1_PADDING };
  assert.equal(verify('sha256', payload, publicKey, signature), true);
  assert.equal(verify('sha256', Buffer.from('changed manifest'), publicKey, signature), false);
  signature[0] ^= 1;
  assert.equal(verify('sha256', payload, publicKey, signature), false);
  // Positive-path compatibility on e=65537 is not a forgery/advisory regression test.
});

test('actual Expo CSR consumer accepts its own signature and rejects tampered CSR signature', () => {
  const { keyPair, certificate } = fixture();
  const csr = certificates.generateCSR(keyPair, 'Synthetic CSR');
  const parsed = certificates.convertCSRPEMToCSR(certificates.convertCSRToCSRPEM(csr));
  assert.equal(parsed.verify(), true);
  assert.doesNotThrow(() => certificates.generateDevelopmentCertificateFromCSR(keyPair.privateKey, certificate, parsed,
    '00000000-0000-4000-8000-000000000001', '@synthetic/project'));
  parsed.signature = String.fromCharCode(parsed.signature.charCodeAt(0) ^ 1) + parsed.signature.slice(1);
  assert.throws(() => certificates.generateDevelopmentCertificateFromCSR(keyPair.privateKey, certificate, parsed,
    '00000000-0000-4000-8000-000000000001', '@synthetic/project'));
});
