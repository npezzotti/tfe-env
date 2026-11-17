import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { SelfSignedCertProvider } from '../../src/tls/selfSigned.js';

// Small key size keeps RSA generation fast.
const TEST_KEY_BITS = 1024;
const DNS_ALT_NAME = 2;

function providerWithSmallKeys(): SelfSignedCertProvider {
  const provider = new SelfSignedCertProvider();
  provider.RSA_KEY_BITS = TEST_KEY_BITS;
  return provider;
}

describe('SelfSignedCertProvider.issue', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('returns PEM-encoded cert, key, and a CA bundle equal to the cert', async () => {
    const result = await providerWithSmallKeys().issue('tfe.example.com');

    assert.match(result.cert, /^-----BEGIN CERTIFICATE-----/);
    assert.match(result.key, /^-----BEGIN RSA PRIVATE KEY-----/);
    assert.equal(result.caBundle, result.cert);
  });

  it('sets the hostname as subject and issuer common name', async () => {
    const { cert: pem } = await providerWithSmallKeys().issue('tfe.example.com');
    const cert = forge.pki.certificateFromPem(pem);

    assert.equal(cert.subject.getField('CN').value, 'tfe.example.com');
    assert.equal(cert.issuer.getField('CN').value, 'tfe.example.com');
  });

  it('includes the hostname as subject alternative name', async () => {
    const { cert: pem } = await providerWithSmallKeys().issue('tfe.example.com');
    const cert = forge.pki.certificateFromPem(pem);

    const san = cert.getExtension('subjectAltName') as {
      altNames: Array<{ type: number; value?: string; ip?: string }>;
    };
    assert.ok(san, 'subjectAltName extension is present');
    assert.ok(
      san.altNames.some((n) => n.type === DNS_ALT_NAME && n.value === 'tfe.example.com'),
      'DNS SAN matches hostname',
    );
  });

  it('is valid from now for CERT_VALIDITY_YEARS', async () => {
    const before = Date.now();
    const provider = providerWithSmallKeys();
    const { cert: pem } = await provider.issue('tfe.example.com');
    const after = Date.now();
    const { notBefore, notAfter } = forge.pki.certificateFromPem(pem).validity;

    // X.509 times have one-second resolution.
    assert.ok(notBefore.getTime() >= before - 1000 && notBefore.getTime() <= after + 1000);
    const expected = new Date(notBefore);
    expected.setFullYear(expected.getFullYear() + provider.CERT_VALIDITY_YEARS);
    assert.equal(notAfter.getTime(), expected.getTime());
  });

  it('honors RSA_KEY_BITS for the generated key', async () => {
    const { cert: pem, key } = await providerWithSmallKeys().issue('tfe.example.com');
    const cert = forge.pki.certificateFromPem(pem);
    const privateKey = forge.pki.privateKeyFromPem(key) as forge.pki.rsa.PrivateKey;

    assert.equal((cert.publicKey as forge.pki.rsa.PublicKey).n.bitLength(), TEST_KEY_BITS);
    assert.equal(privateKey.n.bitLength(), TEST_KEY_BITS);
  });

  it('returns a private key that matches the certificate public key', async () => {
    const { cert: pem, key } = await providerWithSmallKeys().issue('tfe.example.com');
    const cert = forge.pki.certificateFromPem(pem);
    const privateKey = forge.pki.privateKeyFromPem(key) as forge.pki.rsa.PrivateKey;

    assert.equal(
      (cert.publicKey as forge.pki.rsa.PublicKey).n.toString(16),
      privateKey.n.toString(16),
    );
  });

  it('produces a self-signed certificate with a valid signature', async () => {
    const { cert: pem } = await providerWithSmallKeys().issue('tfe.example.com');
    const cert = forge.pki.certificateFromPem(pem);

    assert.equal(cert.verify(cert), true);
  });

  it('generates a distinct serial number and key on each call', async () => {
    const provider = providerWithSmallKeys();
    const a = await provider.issue('tfe.example.com');
    const b = await provider.issue('tfe.example.com');

    assert.notEqual(
      forge.pki.certificateFromPem(a.cert).serialNumber,
      forge.pki.certificateFromPem(b.cert).serialNumber,
    );
    assert.notEqual(a.key, b.key);
  });

  it('rejects when key generation fails', async () => {
    const failure = new Error('keygen failed');
    mock.method(
      forge.pki.rsa,
      'generateKeyPair',
      (_opts: unknown, cb: (err: Error | null, keys?: forge.pki.rsa.KeyPair) => void) =>
        cb(failure),
    );

    await assert.rejects(providerWithSmallKeys().issue('tfe.example.com'), failure);
  });
});
