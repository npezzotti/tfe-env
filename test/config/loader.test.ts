import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { envOverridesInEffect, loadConfig, tryLoadConfig } from '../../src/config/loader.js';

const ENV_KEYS = [
  'TFE_ENV_IMAGE',
  'TFE_ENV_HOSTNAME',
  'TFE_ENV_LICENSE',
  'TFE_ENV_ENCRYPTION_PASSWORD',
  'TFE_ENV_CAPACITY_CONCURRENCY',
  'TFE_ENV_CAPACITY_MEMORY',
  'XDG_CONFIG_HOME',
] as const;

const baseConfig = {
  image: 'hashicorp/terraform-enterprise:latest',
  hostname: 'tfe.example.com',
  licenseKey: 'license-123',
  encryptionPassword: 'secret',
};

let tempDirs: string[] = [];
let savedEnv: Record<string, string | undefined> = {};

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tfe-env-config-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeConfig(dir: string, config: unknown): string {
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(config), 'utf8');
  return file;
}

function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('loadConfig', () => {
  it('parses a valid config file and applies schema defaults', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, baseConfig);

    const config = loadConfig({ configPath });

    assert.equal(config.image, baseConfig.image);
    assert.equal(config.hostname, baseConfig.hostname);
    assert.equal(config.licenseKey, baseConfig.licenseKey);
    assert.equal(config.encryptionPassword, baseConfig.encryptionPassword);
    assert.equal(config.iactToken, null);
    assert.equal(config.capacityConcurrency, null);
    assert.equal(config.capacityMemory, null);
    assert.equal(config.tfeRunPipelineImage, null);
    assert.equal(config.acme, undefined);
    assert.equal(config.tls.certFile, '/etc/ssl/private/terraform-enterprise/cert.pem');
    assert.equal(config.tls.keyFile, '/etc/ssl/private/terraform-enterprise/key.pem');
    assert.equal(config.tls.caBundle, '/etc/ssl/private/terraform-enterprise/bundle.pem');
  });

  it('applies TFE_ENV_* overrides over file values', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {
      ...baseConfig,
      capacityConcurrency: 2,
      capacityMemory: 4096,
    });
    setEnv('TFE_ENV_IMAGE', 'override/image:latest');
    setEnv('TFE_ENV_HOSTNAME', 'override.example.com');
    setEnv('TFE_ENV_LICENSE', 'override-license');
    setEnv('TFE_ENV_ENCRYPTION_PASSWORD', 'override-secret');
    setEnv('TFE_ENV_CAPACITY_CONCURRENCY', '8');
    setEnv('TFE_ENV_CAPACITY_MEMORY', '16384');

    const config = loadConfig({ configPath });

    assert.equal(config.image, 'override/image:latest');
    assert.equal(config.hostname, 'override.example.com');
    assert.equal(config.licenseKey, 'override-license');
    assert.equal(config.encryptionPassword, 'override-secret');
    assert.equal(config.capacityConcurrency, 8);
    assert.equal(config.capacityMemory, 16384);
  });

  it('ignores empty-string environment variable overrides', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, baseConfig);
    setEnv('TFE_ENV_IMAGE', '');
    setEnv('TFE_ENV_HOSTNAME', '');

    const config = loadConfig({ configPath });

    assert.equal(config.image, baseConfig.image);
    assert.equal(config.hostname, baseConfig.hostname);
  });

  it('throws when the config file does not exist', () => {
    const dir = makeTempDir();
    const missing = join(dir, 'missing.json');

    assert.throws(
      () => loadConfig({ configPath: missing }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Config file not found/);
        assert.ok(err.message.includes(missing));
        return true;
      },
    );
  });

  it('resolves the default config path under XDG_CONFIG_HOME', () => {
    const dir = makeTempDir();
    setEnv('XDG_CONFIG_HOME', dir);
    const expected = join(dir, 'tfe-env', 'config.json');

    assert.throws(
      () => loadConfig({}),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Config file not found/);
        assert.ok(err.message.includes(expected));
        return true;
      },
    );
  });

  it('throws a formatted error listing issue paths for missing required fields', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {});

    assert.throws(
      () => loadConfig({ configPath }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^Invalid configuration:\n/);
        for (const field of ['image', 'hostname', 'licenseKey', 'encryptionPassword']) {
          assert.ok(err.message.includes(field), `error mentions ${field}`);
        }
        return true;
      },
    );
  });

  it('supports the http-01 ACME challenge with a defaulted challenge field', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {
      ...baseConfig,
      acme: {
        challenge: 'http-01',
        enabled: true,
        email: 'admin@example.com',
        staging: true,
      },
    });

    const config = loadConfig({ configPath });

    assert.ok(config.acme);
    assert.equal(config.acme.challenge, 'http-01');
    assert.equal(config.acme.enabled, true);
    assert.equal(config.acme.email, 'admin@example.com');
  });

  it('supports dns-01 ACME with a defaulted provider config', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {
      ...baseConfig,
      acme: {
        challenge: 'dns-01',
        dnsProvider: 'manual',
        enabled: true,
        email: 'admin@example.com',
        staging: false,
      },
    });

    const config = loadConfig({ configPath });

    assert.ok(config.acme);
    assert.equal(config.acme.challenge, 'dns-01');
    if (config.acme.challenge === 'dns-01') {
      assert.equal(config.acme.dnsProvider, 'manual');
      assert.deepEqual(config.acme.dnsProviderConfig, {});
    }
  });

  it('rejects dns-01 ACME without a dnsProvider', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {
      ...baseConfig,
      acme: {
        challenge: 'dns-01',
        enabled: true,
        email: 'admin@example.com',
        staging: false,
      },
    });

    assert.throws(() => loadConfig({ configPath }), /Invalid configuration:/);
  });
});

describe('tryLoadConfig', () => {
  it('returns the config and a null reason on success', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, baseConfig);

    const result = tryLoadConfig({ configPath });

    assert.equal(result.reason, null);
    assert.ok(result.config);
    assert.equal(result.config.hostname, baseConfig.hostname);
  });

  it('returns a null config and the error message on failure', () => {
    const dir = makeTempDir();
    const configPath = writeConfig(dir, {});

    const result = tryLoadConfig({ configPath });

    assert.equal(result.config, null);
    assert.match(result.reason ?? '', /Invalid configuration:/);
  });
});

describe('envOverridesInEffect', () => {
  it('returns an empty list when no overrides are set', () => {
    assert.deepEqual(envOverridesInEffect(), []);
  });

  it('returns only the names of set, non-empty override variables', () => {
    setEnv('TFE_ENV_IMAGE', 'img');
    setEnv('TFE_ENV_HOSTNAME', '');
    setEnv('TFE_ENV_LICENSE', 'lic');

    const result = envOverridesInEffect();

    assert.deepEqual(result.sort(), ['TFE_ENV_IMAGE', 'TFE_ENV_LICENSE']);
  });
});
