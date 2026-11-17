import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import ora from 'ora';
import type { TfeEnvInfo } from '../lifecycle/info.js';
import { createLogger } from '../util/logger.js';
import { tfeEnvInfo } from '../lifecycle/info.js';
import chalk from 'chalk';

interface InfoOptions extends GlobalOptions {
  json: boolean;
}

function formatInfo(info: TfeEnvInfo): string {
  return `
Versions:
  TFE Env CLI Version: ${info.versions.tfeEnvCliVersion}
  Image: ${info.versions.image}
  Docker Version: ${info.versions.dockerVersion}
  Docker API Version: ${info.versions.dockerApiVersion}
  Node Version: ${info.versions.nodeVersion}

Configuration:
  Config File: ${info.configuration.configFile}
  Config Source: ${info.configuration.configSource}
  Hostname: ${info.configuration.hostname}
  Overrides: ${info.configuration.overrides}

Data:
  Working Directory: ${info.data.WorkingDirectory}
  Certs Directory: ${info.data.CertsDirectory}
  Data Directory: ${info.data.DataDirectory}
  Logs Directory: ${info.data.LogsDirectory}
${info.warnings && info.warnings.length > 0 ? `${chalk.yellow('Warnings:')}\n${info.warnings.map(w => `  - ${chalk.yellow(w)}`).join('\n')}` : ''}
  `.trim();
}

function formatInfoJson(info: TfeEnvInfo): string {
  return JSON.stringify(info, null, 2) + '\n';
}

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Print resolved configuration (env vars, ports, image tag, working directory)')
    .option('--json', 'Output info as JSON', false)
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<InfoOptions>();
      const spinner = ora('Fetching Terraform Enterprise environment info').start();
      try {
        const info = await tfeEnvInfo(opts.config);
        spinner.stop();
        if (opts.json) {
          process.stdout.write(formatInfoJson(info));
        } else {
          process.stdout.write(formatInfo(info) + '\n');
        }
        process.stdout.write('\n');
        spinner.succeed('Fetched Terraform Enterprise environment info');
      } catch (err) {
        spinner.fail(`Failed to fetch Terraform Enterprise environment info: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
