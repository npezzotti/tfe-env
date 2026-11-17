import * as acme from 'acme-client';

import type { AcmeConfig } from '../config/schema.js';
import { CertMaterial, CertProvider } from '../tls/tls.js';
import type { Logger } from '../util/logger.js';
import { loadOrCreateAccountKey } from './account.js';
import { createChallengeHandler } from './challenges.js';
import { workingDirPath } from '../util/paths.js';

export class AcmeCertProvider implements CertProvider {
  private readonly config: AcmeConfig
  private readonly logger: Logger

  constructor(config: AcmeConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async issue(hostname: string): Promise<CertMaterial> {
    this.logger.debug(`ACME issue start: hostname=${hostname} challenge=${this.config.challenge} staging=${this.config.staging}`);
    acme.setLogger((m) => this.logger.debug(m));

    const handler = createChallengeHandler(this.config);

    const directoryUrl = this.config.staging ?
      acme.directory.letsencrypt.staging :
      acme.directory.letsencrypt.production;
    this.logger.debug(`Using ACME directory: ${directoryUrl}`);

    const workDir = workingDirPath();
    this.logger.debug(`Loading ACME account key from ${workDir}`);
    const accountKey = await loadOrCreateAccountKey(workDir);
    this.logger.debug('ACME account key ready');
    const client = new acme.Client({
      directoryUrl,
      accountKey
    });

    const [key, csr] = await acme.crypto.createCsr({
      commonName: hostname,
      altNames: [hostname],
    });
    this.logger.debug(`CSR created for ${hostname}`);

    this.logger.debug(`Requesting certificate via ACME (email=${this.config.email})`);
    const start = Date.now()
    const cert = await client.auto({
      csr,
      email: this.config.email,
      termsOfServiceAgreed: true,
      challengePriority: [this.config.challenge],
      challengeCreateFn: async (authz, challenge, keyAuthorization) => {
        this.logger.debug(`Creating ${challenge.type} challenge for ${authz.identifier.value}`);
        await handler.create(authz, challenge, keyAuthorization);
        this.logger.debug(`Created ${challenge.type} challenge for ${authz.identifier.value}`);
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        this.logger.debug(`Removing ${challenge.type} challenge for ${authz.identifier.value}`);
        await handler.remove(authz, challenge, keyAuthorization);
      }
    });

    this.logger.debug(`Certificate issued for ${hostname} in ${Date.now() - start}ms`);    

    return {
      cert,
      key: key.toString(),
      caBundle: cert
    }
  }
}
