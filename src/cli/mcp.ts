import type { Command } from 'commander';
import { serveMcp } from '../mcp/server.js';

import pkg from '../../package.json' with {type: 'json'};
import { GlobalOptions } from './types.js';

// Commander exposes `--kebab-case` flags as camelCase properties.
interface McpOptions extends GlobalOptions {
  allowDestructive: boolean;
  allowSecrets: boolean;
}

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Run as an MCP server over stdio.')
    .option('--allow-destructive', 'Allow destructive operations.', false)
    .option('--allow-secrets', 'Allow tools to return unredacted secret values.', false)
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<McpOptions>();
      await serveMcp(pkg.version, opts.allowDestructive, opts.allowSecrets);
    });
}
