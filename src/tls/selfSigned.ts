import { isIP } from 'node:net';
import forge from 'node-forge';
import { CertMaterial, CertProvider } from './tls.js';

// GeneralName types from RFC 5280 section 4.2.1.6
const ALT_NAME_DNS = 2;
const ALT_NAME_IP = 7;

export class SelfSignedCertProvider implements CertProvider {
  RSA_KEY_BITS = 2048;
  CERT_VALIDITY_YEARS = 1;

  async issue(hostname: string): Promise<CertMaterial> {
    const keys = await this.generateKeyPair(this.RSA_KEY_BITS);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    // Leading 0x01 byte keeps the serial a positive ASN.1 INTEGER.
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19));

    const notBefore = new Date();
    const notAfter = new Date(notBefore);
    notAfter.setFullYear(notAfter.getFullYear() + this.CERT_VALIDITY_YEARS);
    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    const attrs = [{ name: 'commonName', value: hostname }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectKeyIdentifier' },
      {
        name: 'subjectAltName',
        altNames: [
          // An IP-literal hostname must be an IP SAN; a DNS SAN would not match.
          isIP(hostname)
            ? { type: ALT_NAME_IP, ip: hostname }
            : { type: ALT_NAME_DNS, value: hostname },
        ],
      },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);

    return {
      cert: certPem,
      key: forge.pki.privateKeyToPem(keys.privateKey),
      caBundle: certPem,
    };
  }

  private generateKeyPair(bits: number): Promise<forge.pki.rsa.KeyPair> {
    return new Promise((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({ bits }, (err, keys) =>
        err ? reject(err) : resolve(keys),
      );
    });
  }
}
