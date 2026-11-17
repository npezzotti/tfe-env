import { checkDockerRunning, execInContainer, findContainerStatus } from '../docker/client.js';
import type { OutputSink } from '../util/output.js';
import { readState } from '../state/store.js';
import { Logger } from '../util/logger.js';

export type ExecLifecycleOptions =
  | { tty: true; signal?: AbortSignal }
  | { tty?: false; sink?: OutputSink; signal?: AbortSignal };

/** Runs `cmd` inside the TFE container and returns its exit code.
 *  Throws if no command is given or the container is missing or not running. */
export async function execTfeContainer(cmd: string[], opts: ExecLifecycleOptions, logger: Logger): Promise<number> {
  if (cmd.length === 0) {
    throw new Error('No command provided to execute in container.');
  }

  const containerName = readState()?.containerName;
  if (!containerName) {
    throw new Error("Container is not running. Run 'tfe-env start' to start Terraform Enterprise.");
  }

  await checkDockerRunning();

  const status = await findContainerStatus(containerName);
  if (status === null) {
    throw new Error(`Container '${containerName}' does not exist.`);
  }
  if (status !== 'running') {
    throw new Error(`Container '${containerName}' is not running (status ${status}).`);
  }

  return execInContainer(containerName, cmd, opts);
}
