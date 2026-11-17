import type { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import type { ChalkInstance } from 'chalk';

import type { GlobalOptions } from './types.js';
import { getTfeEnvStatus } from '../lifecycle/status.js';
import type { HealthStatus } from '../lifecycle/status.js';
import { startTimer } from './timing.js';
import { makeProgressCallback } from './spinner.js';
import { createLogger } from '../util/logger.js';
import { TfeEnvStatus } from '../state/schema.js';

interface StatusOptions extends GlobalOptions {
  json: boolean;
}

const STATUS_COLORS: Record<TfeEnvStatus, ChalkInstance> = {
  running: chalk.green,
  starting: chalk.yellow,
  stopped: chalk.grey,
  stopping: chalk.yellow,
  errored: chalk.red,
  destroyed: chalk.grey,
};

const CONTAINER_STATE_COLORS: Partial<Record<string, ChalkInstance>> = {
  running:   chalk.green,
  'not found': chalk.grey,
};

const HEALTH_COLORS: Partial<Record<HealthStatus, ChalkInstance>> = {
  healthy:   chalk.green,
  unhealthy: chalk.red,
};

function statusLabel(status: TfeEnvStatus): string {
  return STATUS_COLORS[status](status);
}

function containerStateLabel(state: string): string {
  return (CONTAINER_STATE_COLORS[state] ?? chalk.yellow)(state);
}

function healthLabel(health: HealthStatus): string {
  const color = HEALTH_COLORS[health];
  return color ? color(health) : chalk.grey('unknown');
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show running container status, and Terraform Enterprise health')
    .option('--json', 'Output info as JSON', false)
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<StatusOptions>();
      const logger = createLogger(opts.debug);
      const spinner = ora('Checking Terraform Enterprise environment status').start();
      const elapsed = startTimer();
      try {
        const status = await getTfeEnvStatus(logger, makeProgressCallback(spinner));
        spinner.stop();
        if (opts.json) {
          process.stdout.write((JSON.stringify(status, null, 2)) + '\n');
        } else {
          logger.info(`Status    : ${statusLabel(status.status)}`);
          logger.info(`Container : ${containerStateLabel(status.containerStatus)}`);
          if (status.uptime) {
            logger.info(`Uptime    : ${chalk.bold(status.uptime)}`);
          }
          logger.info(`Health    : ${healthLabel(status.health)}`);
          logger.info('');
        }
        spinner.succeed(`Retrieved status (in ${elapsed()})`);
      } catch (err) {
        spinner.fail(`Failed to get status: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
