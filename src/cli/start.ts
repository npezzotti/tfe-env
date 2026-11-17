import ora from 'ora';
import type { Command } from 'commander';

import { startTfeEnv } from '../lifecycle/start.js';
import type { GlobalOptions } from './types.js';
import { makeProgressCallback } from './spinner.js'
import { createLogger } from '../util/logger.js';
import { startTimer } from './timing.js';
import { withLock } from '../lock.js';

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Pull images, generate certs, and start the TFE environment')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<GlobalOptions>();
      const spinner = ora({ discardStdin: true, text: 'Starting Terraform Enterprise' });
      const logger = createLogger(opts.debug)
      const elapsed = startTimer()
      try {
        spinner.start();
        await withLock('start', () => startTfeEnv(
          logger,
          opts.config,
          makeProgressCallback(spinner),
        ));
        spinner.succeed(`Successful started Terraform Enterprise (in ${elapsed()})`)
      } catch (err) {
        spinner.fail(`Failed to start Terraform Enterprise: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1;
      }
    });
}
