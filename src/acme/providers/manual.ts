import * as readline from 'readline/promises';

import type { DnsProvider } from './types.js'
import { waitForTxtPropagation } from './dns-utils.js';

async function prompt(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`${message} `);
  } finally {
    rl.close();
  }
}

/**
 * The manual provider prompts on stdin/stdout. When those are not a terminal (e.g. under the
 * MCP stdio transport, where they carry JSON-RPC, or in CI), prompting would corrupt the
 * stream or hang, so require a TTY on both.
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function createManualProvider(
  _cfg: Record<string, string>,
  isInteractive: () => boolean = isInteractiveTerminal,
): DnsProvider {
  if (!isInteractive()) {
    throw new Error(
      "The 'manual' DNS provider requires an interactive terminal to prompt for TXT record changes. " +
      "Run 'tfe-env start' or 'tfe-env renew' from a shell, or configure an automated DNS provider (e.g. 'route53').",
    );
  }
  return {
    createTxtRecord,
    deleteTxtRecord,
    waitForPropagation,
  };
}

async function createTxtRecord(name: string, value: string): Promise<string> {
  await prompt(`Create a TXT record named "${name}" with value "${value}", then press Enter.`);
  return name;
}

async function deleteTxtRecord(handle: string): Promise<void> {
  await prompt(`You can now delete the TXT record "${handle}". Press Enter to continue.`);
}

export async function waitForPropagation(name: string, value: string, timeoutMs: number): Promise<void> {
  await waitForTxtPropagation(name, value, timeoutMs);
}
