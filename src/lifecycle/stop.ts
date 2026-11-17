import type { Logger } from '../util/logger.js';
import { stopContainer, checkDockerRunning } from '../docker/client.js';
import { readState, updateState } from '../state/store.js';
import { ProgressCallback } from '../cli/types.js';
import { isTerminalStatus } from '../state/schema.js';

async function stopTfeEnv(logger: Logger, onProgress?: ProgressCallback): Promise<void> {
  logger.debug('Stop requested, checking Docker daemon');
  await checkDockerRunning();
  logger.debug('Docker daemon is running');

  const state = readState();
  logger.debug(
    state ?
      `Loaded state: status=${state.status} containerName=${state.containerName} containerId=${state.containerId} startedAt=${state.startedAt}` :
      'No state found'
  );

  if (!state) {
    throw new Error("No Terraform Enterprise environment found. Run 'tfe-env start' to create it.");
  }

  if (state.status === 'stopped') {
    logger.debug("Terraform Enterprise state already 'stopped', nothing to do");
    return;
  }

  if (isTerminalStatus(state.status)) {
    logger.debug(`Status ${state.status} is terminal, refusing to stop`);
    throw new Error(`Terraform Enterprise environment is ${state.status}. Run 'tfe-env start' to create it.`);
  }

  const { containerName } = state;
  if (!containerName) {
    logger.debug(`Status is inconsistent: status=${state.status} but containerName is empty`);
    throw new Error("Missing container name in state. Run 'tfe-env start' to recreate the environment.");
  }

  onProgress?.('Stopping container');
  updateState({ status: 'stopping' });

  const start = Date.now();
  logger.debug(`Stopping container ${containerName}`);
  await stopContainer(containerName, logger);
  logger.debug(`Container ${containerName} stopped in ${Date.now() - start}ms`);

  updateState({
    status: 'stopped',
    containerName: null,
    containerId: null,
    startedAt: null,
  });
  logger.debug('Stop complete');
}

export { stopTfeEnv };