import { existsSync, readFileSync } from 'node:fs';
import { configSchema, type TfeEnvConfig } from './schema.js';
import { resolveConfigPath } from './util.js';

const ENV_VAR_MAP = {
  image: 'TFE_ENV_IMAGE',
  hostname: 'TFE_ENV_HOSTNAME',
  licenseKey: 'TFE_ENV_LICENSE',
  encryptionPassword: 'TFE_ENV_ENCRYPTION_PASSWORD',
  capacityConcurrency: 'TFE_ENV_CAPACITY_CONCURRENCY',
  capacityMemory: 'TFE_ENV_CAPACITY_MEMORY'
} as const satisfies Partial<Record<keyof TfeEnvConfig, string>>;

/**
 * Reads a JSON file from the specified path and returns its contents as an object.
 * @param path Path to the JSON file
 * @returns Parsed JSON object
 */
function readJsonFile(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * Returns a list of environment variable overrides currently in effect.
 * @param env Environment variables object to check for overrides (defaults to process.env)
 * @returns Array of objects containing the key, environment variable name, and value for each override
 */
function activeEnvOverrides(env = process.env): { key: string; envVar: string; value: string }[] {
  return Object.entries(ENV_VAR_MAP)
    .map(([key, envVar]) => ({ key, envVar, value: env[envVar] }))
    .filter((o):
      o is { key: string; envVar: (typeof ENV_VAR_MAP)[keyof typeof ENV_VAR_MAP]; value: string } => {
      return o.value !== undefined && o.value !== '';
    })
}

/**
 * Lists the environment variables currently overriding config file values.
 * @returns Names of the TFE_ENV_* variables that are set
 */
export function envOverridesInEffect(): string[] {
  return activeEnvOverrides().map(o => o.envVar);
}

/**
 * Applies environment variable overrides to the given configuration object.
 * @param config Configuration object to apply environment variable overrides to
 * @returns Configuration object with environment variable overrides applied
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  activeEnvOverrides().forEach((o) => {
    config[o.key] = o.value;
  });

  return config;
}

export interface LoadConfigOptions {
  configPath?: string;
}

export interface LoadConfigResult {
  config: TfeEnvConfig | null;
  reason: string | null;
}

/**
 * Attempts to load the configuration from the specified file and merge it with any environment variable overrides.
 * @param options A LoadConfigOptions object containing the optional path to the configuration file
 * @returns A LoadConfigResult object containing the loaded configuration or the reason for failure
 */
export function tryLoadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  try {
    return { config: loadConfig(options), reason: null };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { config: null, reason: errMsg };
  }
}

/**
 * Loads the TfeEnv configuration from the specified file and applies environment variable overrides.
 * @param options LoadConfigOptions containing the optional path to the configuration file
 * @returns Parsed and validated TfeEnv configuration
 */
export function loadConfig(options: LoadConfigOptions = {}): TfeEnvConfig {
  const configPath = resolveConfigPath(options.configPath);

  let fileConfig: Record<string, unknown> = {};
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    fileConfig = readJsonFile(configPath);
  }

  const merged = applyEnvOverrides({ ...fileConfig });
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${details}`);
  }

  return result.data;
}
