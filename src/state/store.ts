import fs, { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'crypto';

import { ensureDir, statePath } from '../util/paths.js';
import { isTerminalStatus, stateSchema, TfeEnvState } from './schema.js';
import { loadConfig } from '../config/loader.js';

const STATE_FILE_NAME = 'state.json';

export function computeConfigHash(config: ReturnType<typeof loadConfig>): string {
  const relevant = JSON.stringify({
    hostname: config.hostname,
    image: config.image,
    licenseKey: config.licenseKey,
    capacityConcurrency: config.capacityConcurrency,
    capacityMemory: config.capacityMemory,
  });
  return createHash('sha256').update(relevant).digest('hex');
}

export function readState(): TfeEnvState | undefined {
  const file = join(statePath(), STATE_FILE_NAME);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  try {
    const state = readFileSync(file, "utf-8");
    const data = stateSchema.parse(JSON.parse(state));
    return data;
  } catch {
    return undefined;
  }
}

export function writeState(state: TfeEnvState): void {
  const dir = statePath();
  ensureDir(statePath(), 0o700);
  const target = join(dir, STATE_FILE_NAME);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

export class TerminalStateError extends Error {
  constructor(public readonly status: string) {
    super(`Cannot update state: current status '${status}' is terminal and cannot be modified.`);
    this.name = 'TerminalStateError';
  }
}

export function updateState(patch: Partial<TfeEnvState>): void {
  const existing = readState();
  if (!existing) {
    throw new Error('Cannot update state: no existing state found.');
  }
  if (isTerminalStatus(existing.status)) {
    throw new TerminalStateError(existing.status);
  }

  const merged: TfeEnvState = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeState(merged);
}

export function resetState(): void {
  writeState({
    schemaVersion: 1,
    status: 'destroyed',
    containerName: null,
    containerId: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  });
}
