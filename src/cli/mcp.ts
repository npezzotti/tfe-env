import type { Command } from 'commander';
import { serveMcp } from '../mcp/server.js';

import pkg from '../../package.json' with {type: 'json'};
import { GlobalOptions } from './types.js';

interface McpOptions extends GlobalOptions {
  allow_destructive: boolean;
}

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Run as an MCP server over stdio.')
    .option('--allow-destructive', 'Allow destuctive operations.', false)
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<McpOptions>();
      await serveMcp(pkg.version, opts.allow_destructive);
    });
}
