import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import { renewTfeEnvCert } from '../lifecycle/renew.js';
import { createLogger } from '../util/logger.js';
import ora from 'ora';

export function registerRenewCommand(program: Command): void {
  program
    .command('renew')
    .description('Renew Lets Encrypt certificate.')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<GlobalOptions>();
      const logger = createLogger(opts.debug);
      const spinner = ora("Renewing Terraform Enterprise certificate").start();
      try {
        await renewTfeEnvCert(logger);
        spinner.succeed("Successfully renewed Terraform Enterprise certificate")
      } catch (err) {
        spinner.fail(`Failed to renew: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}
