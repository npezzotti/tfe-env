import ora from 'ora';
import type { Command } from 'commander';

import type { GlobalOptions } from './types.js';
import { createLogger } from '../util/logger.js';
import { stopTfeEnv } from '../lifecycle/stop.js';
import { startTimer } from './timing.js';
import { withLock } from '../lock.js';
import { makeProgressCallback } from './spinner.js';

export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop the running containers (volumes are preserved)')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<GlobalOptions>();
      const logger = createLogger(opts.debug);
      const spinner = ora("Stopping Terraform Enterprise").start();
      const elapsed = startTimer();
      try {
        await withLock('stop', () => stopTfeEnv(logger, makeProgressCallback(spinner)));
        spinner.succeed(`Successfully stopped Terraform Enterprise (in ${elapsed()})`);
      } catch (err) {
        spinner.fail(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
