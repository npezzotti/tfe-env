import { checkDockerRunning, streamContainerLogs } from "../docker/client.js";
import type { OutputSink } from "../util/output.js";
import { readState } from "../state/store.js";
import { parseDuration } from "../util/time.js";
import { Logger } from "../util/logger.js";

export interface LogsLifecycleOptions {
  follow: boolean
  since?: string,
  until?: string,
  tail?: number
  sink: OutputSink
  signal?: AbortSignal
}

export async function logsTfeEnv(logsOpts: LogsLifecycleOptions, logger: Logger): Promise<void> {
  const now = Date.now();
  let since = logsOpts.since ? parseDuration('since', logsOpts.since, now) : undefined;
  let until = logsOpts.until ? parseDuration('until', logsOpts.until, now) : undefined;

  if (since !== undefined && until !== undefined && since >= until) {
    throw new Error('Invalid time range: --since must be earlier than --until.');
  }

  logger.debug(`Log time bounds: since=${since ?? 'none'} until=${until ?? 'none'} tail=${logsOpts.tail ?? 'none'}`);
  const containerName = readState()?.containerName;
  if (!containerName) {
    throw new Error('Terraform Enterprise environment is not running.');
  }

  logger.debug(`Streaming logs from container: ${containerName}`);

  await checkDockerRunning();
  logger.debug('Docker daemon is running');

  await streamContainerLogs(containerName, {
    follow: logsOpts.follow,
    since: since,
    until: until,
    tail: logsOpts.tail,
    sink: logsOpts.sink,
    signal: logsOpts.signal,
  });
  logger.debug('Log stream complete');
}
