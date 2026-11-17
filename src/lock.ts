import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import * as properlock from 'proper-lockfile';
import { randomUUID } from 'node:crypto';
import { join } from "node:path";

import { lockPath } from './util/paths.js';
import pkg from '../package.json' with { type: 'json' };

const CLI_VERSION = pkg.version;
const LOCK_TARGET = join(lockPath(), 'tfe-env');
const META_TARGET = LOCK_TARGET + '.meta.json';
const STALE_MS = 30_000;

interface LockMetadata {
  command: string;
  pid: number;
  acquiredAt: Date;
}

interface LockMetaFile {
  command: string;
  pid: number;
  acquiredAt: string;
  token: string;
  version: string;
}

interface LockHandle {
  metadata: LockMetadata;
  release: () => Promise<void>;
}

export async function withLock<T>(command: string, fn: () => Promise<T>): Promise<T> {
  const handle = await acquireLock(command);
  try {
    return await fn();
  } finally {
    await releaseLock(handle);
  }
}

async function newLockHeldError(): Promise<LockHeldError> {
  try {
    const raw = await readFile(META_TARGET, 'utf-8');
    const existingMeta: LockMetaFile = JSON.parse(raw);
    const holder: LockMetadata = {
      command: existingMeta.command,
      pid: existingMeta.pid,
      acquiredAt: new Date(existingMeta.acquiredAt),
    };
    const msg = `'tfe-env ${existingMeta.command}' is already in progress (PID ${existingMeta.pid}). If that process is no longer running, retry in ~${STALE_MS / 1000}s or remove the lock file manually.`;
    return new LockHeldError(msg, holder);
  } catch {
    return new LockHeldError(
      `Another tfe-env process is holding the lock. If it is no longer running, retry in ~${STALE_MS / 1000}s or remove the lock file manually.`,
    );
  }
}

async function acquireLock(command: string): Promise<LockHandle> {
  await mkdir(lockPath(), {
    recursive: true,
    mode: 0o700
  });

  let releaseFn: () => Promise<void>;
  try {
    releaseFn = await properlock.lock(LOCK_TARGET, {
      retries: 0,
      realpath: false,
      stale: STALE_MS,
      update: 5_000,
      onCompromised: (err) => {
        console.error(`tfe-env lock was lost: ${err.message}. Another tfe-env process may now be running.`);
        process.exitCode = 1;
      },
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ELOCKED") {
      throw await newLockHeldError();
    }
    throw err;
  }

  const token = randomUUID();
  const acquiredAt = new Date();
  const metaContent: LockMetaFile = {
    command,
    pid: process.pid,
    acquiredAt: acquiredAt.toISOString(),
    token,
    version: CLI_VERSION,
  };
  const tmpMetaPath = META_TARGET + '.' + process.pid + '.tmp';
  try {
    await writeFile(tmpMetaPath, JSON.stringify(metaContent, null, 2), 'utf-8');
    await rename(tmpMetaPath, META_TARGET);
  } catch (err) {
    await unlink(tmpMetaPath).catch(() => { });
    await releaseFn();
    throw err;
  }

  const metadata: LockMetadata = {
    command,
    pid: process.pid,
    acquiredAt,
  };

  const release = async (): Promise<void> => {
    try {
      const stored: LockMetaFile = JSON.parse(await readFile(META_TARGET, 'utf-8'));
      if (stored.token === token) await unlink(META_TARGET).catch(() => { });
    } catch {
    } finally {
      await releaseFn();
    }
  };

  return {
    metadata,
    release,
  };
}

async function releaseLock(handle: LockHandle): Promise<void> {
  await handle.release();
}

export class LockHeldError extends Error {
  holder: LockMetadata | null;

  constructor(message?: string, holder?: LockMetadata) {
    super(message);
    this.name = 'LockHeldError';
    this.holder = holder ?? null;
  }
}
