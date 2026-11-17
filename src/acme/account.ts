import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'node:fs/promises';
import * as acme from 'acme-client';

import { dirname, join } from 'path';

const ACCOUNT_KEY_FILE = 'account.key';

export async function loadOrCreateAccountKey(workDir: string): Promise<Buffer> {
  const keyPath = join(workDir, 'acme', ACCOUNT_KEY_FILE);
  if (existsSync(keyPath)) return readFileSync(keyPath);
  const key = await acme.crypto.createPrivateKey();
  mkdirSync(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, key, { mode: 0o600 });
  return key;
}
