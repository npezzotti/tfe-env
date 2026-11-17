import type { GlobalOptions } from '../cli/types.js';
import { loadConfig } from '../config/loader.js';
import { pullImage, startContainer, imageExists, stopContainer, containerExists, checkDockerRunning } from '../docker/client.js';
import { ensureCerts } from '../tls/tls.js';
import { Logger } from '../util/logger.js';
import { resolveWorkingDir } from '../util/paths.js';
import { waitHealthy } from './health.js';
import { ProgressCallback } from '../cli/types.js';
import { writeState, computeConfigHash, readState, updateState } from '../state/store.js';
import { TfeEnvConfig } from '../config/schema.js';

const TFE_HTTP_PORT = 80;

export async function startTfeEnv(
  logger: Logger,
  configPath?: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  await checkDockerRunning();

  const config = loadConfig({ configPath });
  const configHash = computeConfigHash(config);
  const previous = readState();
  const configChanged = previous?.configHash !== configHash;

  if (configChanged) logger.debug('Detected config change');

  if (previous?.containerName) {
    const canReuse =
      previous.status === 'running' && !configChanged && (await containerExists(previous.containerName));

    if (canReuse) {
      logger.info('Terraform Enterprise is already running with the current config.\n');
      logAccessInfo(config, logger);
      return;
    }

    onProgress?.('Stopping existing container');
    await stopContainer(previous.containerName, logger);
  }

  onProgress?.('Ensuring TLS certificates');
  const workDir = resolveWorkingDir();
  await ensureCerts(config, workDir, logger);

  // Check if the image is already pulled, if not, pull it
  const alreadyPulled = await imageExists(config.image);
  if (!alreadyPulled) {
    onProgress?.('Pulling images');
    await pullImage(config.image, config.licenseKey, logger);
  } else {
    logger.debug('Image already exists, skipping pull.');
  }

  writeState({
    schemaVersion: 1,
    status: 'starting',
    containerName: null,
    containerId: null,
    hostname: config.hostname,
    configHash,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  });

  onProgress?.('Starting container(s)');
  let containerData;
  try {
    containerData = await startContainer(config.image, config, workDir, (created) => {
      // Persist container identifiers immediately so a failed start leaves a trackable container.
      updateState({ containerName: created.name, containerId: created.id });
    });
  } catch (err) {
    updateState({ status: 'errored' });
    throw err;
  }

  updateState({
    containerName: containerData.name,
    containerId: containerData.id,
    startedAt: containerData.startedAt,
  });

  onProgress?.('Waiting for Terraform Enterprise to become healthy (this can take a few minutes).');
  try {
    await waitHealthy({ port: TFE_HTTP_PORT });
  } catch (err) {
    updateState({ status: 'errored' });
    throw err;
  }

  updateState({ status: 'running' });
  logAccessInfo(config, logger);
}

function logAccessInfo(config: TfeEnvConfig, logger: Logger): void {
  logger.info('');
  logger.info(` Dashboard     : https://${config.hostname}`);
  logger.info(` IACT endpoint : https://${config.hostname}/admin/account/new?token=${config.iactToken}`);
  logger.info('');
}
