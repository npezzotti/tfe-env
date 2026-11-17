import { randomBytes } from "crypto";
import { xdgConfigHome } from '../util/xdg.js';
import { join, resolve } from "path";
import { homedir } from "os";

/**
 * Generates a random token/password string suitable for use as an iact token or encryption password.
 * @param length - Number of random bytes to use (output will be hex-encoded, so string length = length * 2)
 */
export function generateBasicPassword(length: number = 16): string {
  return randomBytes(length).toString('hex');
}

/**
 * Expands the tilde (~) in the given path to the user's home directory if present.
 * @param path - Path to file which may contain a tilde (~) representing the home directory
 * @returns Normalized absolute path with home directory expanded if applicable
 */
export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/**
 * Resolves the configuration file path, using the override if provided, or falling back to the default location.
 * @param override - Optional path to override the default configuration file location
 * @returns Absolute path to the configuration file
 */
export function resolveConfigPath(override?: string): string {
  const configPath = override ? expandHome(override) : join(xdgConfigHome(), 'tfe-env', 'config.json');
  return resolve(configPath);
}
