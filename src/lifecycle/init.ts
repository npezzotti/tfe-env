import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateBasicPassword } from '../config/util.js';
import { join } from 'node:path';
import type { ProgressCallback, PromptCallback } from '../cli/types.js';
import { xdgConfigHome, xdgDataHome } from '../util/xdg.js';
import { ensureDir } from '../util/paths.js';

export interface InitResult {
  configFilePath: string;
  alreadyInitialized: boolean;
}

export async function initializeTfeEnv(
  reconfigure: boolean,
  onProgress: ProgressCallback,
  prompt: PromptCallback,
): Promise<InitResult> {
  const configDir = join(xdgConfigHome(), 'tfe-env');
  ensureDir(configDir, 0o700);

  const dataHome = join(xdgDataHome(), 'tfe-env');
  ensureDir(join(dataHome, 'certs'), 0o700);
  ensureDir(join(dataHome, 'data'), 0o700);

  const configFilePath = join(configDir, 'config.json');
  if (existsSync(configFilePath) && !reconfigure) {
    // Tighten permissions in case the file was created with a looser umask.
    chmodSync(configFilePath, 0o600);
    return { configFilePath, alreadyInitialized: true };
  }

  // Load any pre-existing config so values can be preserved when the user
  // leaves a prompt blank during a reconfigure run.
  let existingConfig: Record<string, unknown> = {};
  if (reconfigure && existsSync(configFilePath)) {
    existingConfig = JSON.parse(readFileSync(configFilePath, 'utf8'));
  }
  const existingLicenseKey = typeof existingConfig.licenseKey === 'string' ? existingConfig.licenseKey.trim() : '';
  const existingHostname = typeof existingConfig.hostname === 'string' ? existingConfig.hostname.trim() : '';
  const existingImage = typeof existingConfig.image === 'string' ? existingConfig.image.trim() : '';

  const imageInput = (await prompt('Enter image: ')).trim();
  const hostnameInput = (await prompt('Enter hostname: ')).trim();
  const licenseKeyInput = (await prompt('Enter license: ')).trim();

  const image = imageInput || existingImage;
  const hostname = hostnameInput || existingHostname;
  const licenseKey = licenseKeyInput || existingLicenseKey;

  if (!image) {
    throw new Error('Image is required. Please provide a valid image.');
  }

  if (!hostname) {
    throw new Error('Hostname is required. Please provide a valid hostname.');
  }

  if (!licenseKey) {
    throw new Error('License key is required. Please provide a valid license key.');
  }

  onProgress('Saving configuration');
  const config = { ...existingConfig, image, hostname, licenseKey, encryptionPassword: generateBasicPassword(), iactToken: generateBasicPassword() };
  writeFileSync(configFilePath, JSON.stringify(config, null, 2), { mode: 0o600 });
  return { configFilePath, alreadyInitialized: false };
}
