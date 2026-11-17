import path, { join } from "path";

import { xdgDataHome, xdgRuntimeDir, xdgStateHome } from "./xdg.js";
import { existsSync, mkdirSync } from "fs";

/** Returns (and creates) the working directory for generated artifacts. */
export function resolveWorkingDir(): string {
  const dir = workingDirPath();
  mkdirSync(join(dir, 'certs'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'logs'), { recursive: true });
  return dir;
}

export function workingDirPath(): string {
  return join(xdgDataHome(), 'tfe-env');
}

/** Directory that holds the state file. */
export function statePath(): string {
  return path.join(xdgStateHome(), 'tfe-env');
}

export function lockPath(): string {
  return path.join(xdgRuntimeDir(), 'tfe-env', '.lock');
}

export function ensureDir(dirPath: string, mode: number): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode });
  }
}