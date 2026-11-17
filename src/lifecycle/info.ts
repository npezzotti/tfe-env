import { resolveConfigPath } from '../config/util.js';
import pkg from "../../package.json" with { type: 'json' };
import { envOverridesInEffect, tryLoadConfig } from '../config/loader.js';
import { checkDockerRunning, getDockerVersionInfo } from "../docker/client.js";
import { getSelfSignedCertExpiry } from '../tls/tls.js';
import { expiresSoon } from '../util/helpers.js';
import { workingDirPath } from '../util/paths.js';

export type TfeEnvInfoData = {
  WorkingDirectory: string;
  CertsDirectory: string;
  DataDirectory: string;
  LogsDirectory: string;
}

export type TfeEnvInfoConfig = {
  configFile: string;
  configSource: string;
  hostname: string;
  overrides: string;
}


export type TfeEnvInfoVersions = {
  tfeEnvCliVersion: string;
  image: string;
  dockerVersion: string;
  dockerApiVersion: string;
  nodeVersion: string;
}

export type TfeEnvInfo = {
  versions: TfeEnvInfoVersions;
  configuration: TfeEnvInfoConfig;
  data: TfeEnvInfoData;
  warnings?: string[];
}

export async function tfeEnvInfo(configPath?: string): Promise<TfeEnvInfo> {
  const warnings: string[] = [];
  const resolvedConfigPath = resolveConfigPath(configPath);
  const configResult = tryLoadConfig({ configPath: resolvedConfigPath });
  configResult.reason && warnings.push(`Failed to load config: ${configResult.reason}`);

  const [pingResult, versionResult] = await Promise.allSettled([
    checkDockerRunning(),
    getDockerVersionInfo(),
  ]);

  if (pingResult.status === 'rejected') {
    warnings.push(String(pingResult.reason));
  }
  if (versionResult.status === 'rejected') {
    warnings.push(`Failed to get Docker version info: ${versionResult.reason}`);
  }

  const dockerVersion = versionResult.status === 'fulfilled' ? versionResult.value : undefined;

  const versions: TfeEnvInfoVersions = {
    tfeEnvCliVersion: pkg.version,
    image: configResult.config?.image || '',
    dockerVersion: dockerVersion?.Version || '',
    dockerApiVersion: dockerVersion?.ApiVersion || '',
    nodeVersion: process.version,
  };

  const configuration: TfeEnvInfoConfig = {
    configFile: resolvedConfigPath,
    configSource: process.env.XDG_CONFIG_HOME || 'default',
    hostname: configResult.config?.hostname || '',
    overrides: envOverridesInEffect().join(', '),
  };

  // TODO, add lets encrypt source when ready
  const expiryDate = getSelfSignedCertExpiry();
  if (expiryDate && expiresSoon(expiryDate)) {
    warnings.push(`Self-signed certificate is expiring soon: ${expiryDate.toLocaleDateString()}`);
  }

  const data: TfeEnvInfoData = {
    WorkingDirectory: workingDirPath(),
    CertsDirectory: workingDirPath() + '/certs' + (expiryDate ? ` (self-signed, expires ${expiryDate.toLocaleDateString()})` : ''),
    DataDirectory: workingDirPath() + '/data',
    LogsDirectory: workingDirPath() + '/logs',
  };

  const info: TfeEnvInfo = {
    versions,
    configuration,
    data,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return info;
}
