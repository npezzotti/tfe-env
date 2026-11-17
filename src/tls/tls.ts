import { dirname, join } from "node:path";
import forge from 'node-forge';
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";

import { SelfSignedCertProvider } from "./selfSigned.js";
import { AcmeCertProvider } from "../acme/acme.js";
import { TfeEnvConfig } from "../config/schema.js";
import { Logger } from "../util/logger.js";
import { workingDirPath } from "../util/paths.js";
import { randomUUID } from "node:crypto";

export interface CertProvider {
  issue(hostname: string): Promise<CertMaterial>;
}

export type CertMaterial = {
  cert: string;
  key: string;
  caBundle: string;
}

export type CertPaths = {
  hostnameFile: string;
  certFile: string;
  keyFile: string;
  caBundleFile: string;
}

export function resolveCertPaths(certsDir: string): CertPaths {
  return {
    hostnameFile: join(certsDir, 'hostname'),
    certFile: join(certsDir, 'cert.pem'),
    keyFile: join(certsDir, 'key.pem'),
    caBundleFile: join(certsDir, 'bundle.pem'),
  };
}

/**
 * Reads the expiration date (`notAfter`) of the certificate stored in a tfe-env certs directory.
 * @param certsDir Directory containing the certificate files. Defaults to the `certs` folder
 *   of the tfe-env working directory.
 * @returns The expiration date, or `null` if the certificate file is missing or cannot be parsed.
 */
export function getSelfSignedCertExpiry(certsDir: string = join(workingDirPath(), 'certs')): Date | null {
  const { certFile } = resolveCertPaths(certsDir);
  try {
    return forge.pki.certificateFromPem(readFileSync(certFile, 'utf-8')).validity.notAfter;
  } catch {
    return null;
  }
}


export function createCertProvider(config: TfeEnvConfig, logger: Logger) {
  return config.acme?.enabled ?
    new AcmeCertProvider(config.acme, logger) :
    new SelfSignedCertProvider();
}

/**
 * Ensures that the necessary certificates exist, generating them if needed.
 * @param workDir The data directory for tfe-env
 * @param hostname The Terraform Enterprise hostname
 * @returns The paths to the generated or existing certificate, key, and CA bundle files
 */
export async function ensureCerts(config: TfeEnvConfig, workDir: string, logger: Logger): Promise<void> {
  const certsDir = join(workDir, 'certs');
  const paths: CertPaths = {
    hostnameFile: join(certsDir, 'hostname'),
    certFile: join(certsDir, 'cert.pem'),
    keyFile: join(certsDir, 'key.pem'),
    caBundleFile: join(certsDir, 'bundle.pem'),
  };
  const certFiles = Object.values(paths);

  logger.debug(`Ensuring certs: hostname=${config.hostname} certsDir=${certsDir}`)
  // Discard existing certs when the hostname is unknown or has changed so they are re-created.
  const savedHostname = existsSync(paths.hostnameFile)
    ? readFileSync(paths.hostnameFile, 'utf-8').trim()
    : undefined;
  if (savedHostname !== config.hostname) {
    logger.debug(
      savedHostname === undefined ?
        'No saved hostname found, discarding existing certs' :
        `Hostname has changed from ${savedHostname} to ${config.hostname}, dicarding existing certs`
    )
    for (const f of [...certFiles]) {
      rmSync(f, { force: true });
    }
  } else if (certFiles.every((f) => existsSync(f))) {
    logger.debug('Existing certs match hostname and all files are present, skipping issuance');
    return;
  } else {
    logger.debug(`Hostname matches, but some cert files missing: ${certFiles.filter((f) => {
      !existsSync(f);
    }).join(', ')}`)
  }

  mkdirSync(certsDir, { recursive: true });

  const provider = createCertProvider(config, logger)
  logger.debug(`Issuing cert for ${config.hostname} using ${provider.constructor.name}`);

  const start = Date.now();
  const certMaterial = await provider.issue(config.hostname);
  logger.debug(`Cert issued in ${Date.now() - start}ms`);

  await writeCerts(paths, config.hostname, certMaterial);
  logger.debug(`Certs written to ${certsDir}`);
}

export async function writeCerts(paths: CertPaths, hostname: string, m: CertMaterial): Promise<void> {
  await mkdir(dirname(paths.certFile), { recursive: true });

  const files = [
    { dest: paths.certFile, data: m.cert, mode: 0o666 },
    { dest: paths.keyFile, data: m.key, mode: 0o600 },
    { dest: paths.caBundleFile, data: m.caBundle, mode: 0o666 },
    { dest: paths.hostnameFile, data: hostname, mode: 0o666 },
  ]

  const staged: Array<{ tmp: string, dest: string }> = [];

  try {
    for (const { dest, data, mode } of files) {
      const tmp = `${dest}.${process.pid}.${randomUUID()}.tmp`;
      staged.push({tmp, dest});
      const handle = await open(tmp, 'w', mode);
      try {
        await handle.writeFile(data, 'utf-8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    for (const { tmp, dest } of staged) {
      await rename(tmp, dest);
    }
  } finally {
    await Promise.all(staged.map(({ tmp }) => rmSync(tmp, { force: true })))
  }
}
