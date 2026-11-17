import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProgressCallback } from '../cli/types.js';
import { checkDockerRunning, DISK_CACHE_VOLUME, removeVolume, stopContainer } from '../docker/client.js';
import type { Logger } from '../util/logger.js';
import { xdgDataHome } from '../util/xdg.js';
import { readState, resetState, updateState } from '../state/store.js';

export interface DestroyResult {
  success: boolean;
}

export async function destroyTfeEnv(logger: Logger, onProgress?: ProgressCallback): Promise<DestroyResult> {
  await checkDockerRunning();

  const containerName = readState()?.containerName;
  if (containerName) {
    onProgress?.('Stopping Terrafom Enterprise container');
    await stopContainer(containerName, logger);
    updateState({ status: 'stopped', containerName: null, containerId: null, startedAt: null });
  }

  onProgress?.('Removing volumes');
  await removeVolume(DISK_CACHE_VOLUME);

  onProgress?.('Removing data directory');
  await rm(join(xdgDataHome(), 'tfe-env'), { recursive: true, force: true });

  resetState();
  return { success: true };
}