import { join } from "path";
import { loadConfig } from "../config/loader.js";
import { createCertProvider, resolveCertPaths, writeCerts } from "../tls/tls.js";
import type { Logger } from "../util/logger.js";
import { workingDirPath } from "../util/paths.js";


/**
 * Re-issues the ACME certificate for the configured hostname and overwrites the files
 * in the tfe-env `certs` directory.
 * @throws If ACME is not enabled in the tfe-env configuration.
 */
export async function renewTfeEnvCert(logger: Logger): Promise<void> {
  const config = loadConfig();
  if (!config.acme?.enabled) {
    throw new Error("Certificate renewal requires ACME to be enabled in the tfe-env configuration");
  }

  const { hostname } = config;
  const certDir = join(workingDirPath(), 'certs');
  const paths = resolveCertPaths(certDir);

  logger.debug(`Renewing cert for ${hostname}`);
  const certMaterial = await createCertProvider(config, logger).issue(hostname);
  await writeCerts(paths, hostname, certMaterial);
  logger.debug(`Renewed certs written to ${certDir}`);
}
