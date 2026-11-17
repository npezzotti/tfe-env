import { Command } from 'commander';
import { registerInitCommand } from './cli/init.js';
import { registerStartCommand } from './cli/start.js';
import { registerStopCommand } from './cli/stop.js';
import { registerDestroyCommand } from './cli/destroy.js';
import { registerLogsCommand } from './cli/logs.js';
import { registerStatusCommand } from './cli/status.js';
import { registerExecCommand } from './cli/exec.js';
import { registerInfoCommand } from './cli/info.js';
import { registerConfigCommand } from './cli/config.js';
import { registerRenewCommand } from './cli/renew.js';
import pkg from '../package.json' with { type: 'json' };
import { registerMcpCommand } from './cli/mcp.js';

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('tfe-env')
    .description(
      'A CLI tool for spinning up a local Terraform Enterprise (FDO) environment using Docker.'
    )
    .version(pkg.version)
    .usage('[options] <command>')
    .option('-d, --debug', 'Verbose output for debugging', false)
    .option('-c, --config <path>', 'Override .tfe-env.json location')
    .enablePositionalOptions()
    .showHelpAfterError()
    .addHelpText('after', `
Example usage:
  $ tfe-env init
  $ tfe-env start
  $ tfe-env stop
  $ tfe-env status
  $ tfe-env exec <container> <command>`
    );

  registerInitCommand(program);
  registerConfigCommand(program);
  registerStartCommand(program);
  registerStopCommand(program);
  registerDestroyCommand(program);
  registerLogsCommand(program);
  registerStatusCommand(program);
  registerExecCommand(program);
  registerInfoCommand(program);
  registerRenewCommand(program);
  registerMcpCommand(program);

  await program.parseAsync(argv);
}

void run(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
