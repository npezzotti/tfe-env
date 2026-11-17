import * as readline from 'readline';
import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import ora from 'ora';
import { destroyTfeEnv } from '../lifecycle/destroy.js';
import { withLock } from '../lock.js';
import { makeProgressCallback } from './spinner.js';
import { createLogger } from '../util/logger.js';
import chalk from 'chalk';

interface DestroyOptions extends GlobalOptions {
  yes: boolean;
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

export function registerDestroyCommand(program: Command): void {
  program
    .command('destroy')
    .description('Remove the container, volumes, data and certificates.')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<DestroyOptions>();
      const logger = createLogger(opts.debug);
      const spinner = ora();
      const warning = `${chalk.bgRed.white.bold(' DANGER ')} ${chalk.red.bold('This action will destroy the container, volumes, data and certificates.\n')}`
      const question = `${chalk.bold("Are you sure you want to proceed?")} ${chalk.dim("[y/N] ")}`
      const confirmed =
        opts.yes ||
        (await promptConfirm(
          `${warning}${question}`
        ));
      if (!confirmed) {
        spinner.fail('Destroy cancelled.');
        return;
      }
      spinner.start('Destroying Terraform Enterprise environment');
      try {
        await withLock('destroy', () => destroyTfeEnv(logger, makeProgressCallback(spinner)));
        spinner.succeed('Terraform Enterprise environment destroyed successfully.');
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        spinner.fail('Error destroying Terraform Enterprise environment');
      }
    });
}
