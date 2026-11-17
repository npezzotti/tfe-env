import ora from 'ora';
import type { Command } from 'commander';

import { initializeTfeEnv } from '../lifecycle/init.js';
import type { GlobalOptions } from './types.js';
import { makeProgressCallback, makePromptCallback } from './spinner.js';

interface InitOptions extends GlobalOptions {
  reconfigure: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initalize tfe-env by writing the default config file')
    .option('-r, --reconfigure', 'Reconfigure the environment', false)
    .action(async function (this: Command) {
      const spinner = ora({ discardStdin: true, text: 'Initializing tfe-env' }).start();
      const opts = this.optsWithGlobals<InitOptions>();
      try {
        const result = await initializeTfeEnv(
          opts.reconfigure,
          makeProgressCallback(spinner),
          makePromptCallback(spinner),
        );
        if (result.alreadyInitialized) {
          spinner.info(`tfe-env is already initialized. Configuration file: ${result.configFilePath}`);
        } else {
          spinner.succeed(`tfe-env initialized successfully. Configuration file: ${result.configFilePath}`);
        }
      } catch (err) {
        spinner.fail('Failed to initialize tfe-env.');
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
      }
    });
}