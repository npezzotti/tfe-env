import * as readline from 'readline/promises';
import { Resolver } from 'dns/promises';

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

export function createManualProvider(_cfg: Record<string, string>): DnsProvider {
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
  waitForTxtPropagation(name, value, timeoutMs);
}
