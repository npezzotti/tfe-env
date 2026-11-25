import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import { showConfig } from '../lifecycle/config.js';
import { createLogger } from '../util/logger.js';


interface ConfigOptions extends GlobalOptions {
  edit?: boolean;
}

export function registerConfigCommand(program: Command): void {
  program
    .command('config')
    .option('-e, --edit', 'Edit the current configuration using the default editor')
    .description('View or manage the configuration')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<ConfigOptions>();
      const logger = createLogger(opts.debug);
      try {
        const config = await showConfig(opts.edit ?? false, opts.config ?? '');
        if (!opts.edit) {
          process.stdout.write(JSON.stringify(config, null, 2));
          process.stdout.write('\n');
        }
      } catch (err) {
        logger.error(`Failed to retrieve configuration: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}
