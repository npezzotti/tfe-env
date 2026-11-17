import ora from 'ora';

import { createLogger } from '../util/logger.js';
import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import { execTfeContainer } from '../lifecycle/exec.js';
import { startTimer } from './timing.js';

export function registerExecCommand(program: Command): void {
  program
    .command('exec')
    .description('Run an arbitrary command inside a named service container')
    .argument('[cmd...]', 'Command to run inside the container')
    .passThroughOptions()
    .action(async function (this: Command, cmd: string[]) {
      const opts = this.optsWithGlobals<GlobalOptions>();
      const logger = createLogger(opts.debug);
      const spinner = ora('Running command');
      const isTty = Boolean(process.stdin.isTTY);
      if (!isTty) spinner.start();
      const ac = new AbortController();
      const onSigInt = () => ac.abort();
      process.once('SIGINT', onSigInt);
      const elapsed = startTimer();
      try {
        const code = await execTfeContainer(cmd, {
          tty: isTty,
          sink: {
            stdout: process.stdout,
            stderr: process.stderr,
          },
          signal: ac.signal, 
        }, logger);
        if (code === 0) {
          spinner.succeed(`Finished running command (in ${elapsed()}).`);
        } else {
          spinner.fail(`Command exited with code ${code} (in ${elapsed()}).`);
          process.exitCode = code;
        }
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        spinner.fail(`Failed running command.`);
      } finally {
        process.removeListener('SIGINT', onSigInt);
      }
    });
}
