import { InvalidArgumentError, type Command } from 'commander';
import type { GlobalOptions } from './types.js';
import { logsTfeEnv } from '../lifecycle/logs.js';
import { createLogger } from '../util/logger.js';

interface LogsOptions extends GlobalOptions {
  since?: string;
  until?: string;
  follow: boolean;
  tail?: number;
}

function parseTail(value: string): number {
  if (!/^\d+$/.test(value) || Number.isSafeInteger(value)) {
    throw new InvalidArgumentError('Must be a non-negative integer.');
  }
  return Number(value);
}

export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .description('Stream or tail the TFE container logs')
    .option('-f, --follow', 'Follow log output', false)
    .option('-n, --tail <n>', 'Number of lines to show from the end of the log (default: all)', parseTail)
    .option('--since <string>', 'Show logs since timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)')
    .option('--until <string>', 'Show logs before a timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<LogsOptions>();
      let onSigInt: (() => void) | undefined;
      const logger = createLogger(opts.debug)
      try {
        const ac = new AbortController();
        onSigInt = () => ac.abort();
        process.once('SIGINT', onSigInt);

        await logsTfeEnv({
          follow: opts.follow,
          since: opts.since,
          until: opts.until,
          tail: opts.tail,
          sink: { stdout: process.stdout, stderr: process.stderr },
          signal: ac.signal
        }, logger);
      } catch (err) {
        console.error(`Error getting container logs: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      } finally {
        if (onSigInt) process.removeListener('SIGINT', onSigInt);
      }
    });
}
