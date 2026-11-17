import { homedir } from 'node:os';
import { join } from 'node:path';

export function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

export function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
}

export function xdgStateHome(): string {
  return process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
}

export function xdgRuntimeDir(): string {
  return process.env.XDG_RUNTIME_DIR || xdgStateHome();
}
