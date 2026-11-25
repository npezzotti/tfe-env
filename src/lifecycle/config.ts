import { loadConfig } from '../config/loader.js';
import { TfeEnvConfig } from '../config/schema.js';
import { resolveConfigPath } from '../config/util.js';

export async function showConfig(edit: boolean, configPath?: string): Promise<TfeEnvConfig> {
  if (edit) {
    configPath = resolveConfigPath(configPath);
    const editor = process.env.EDITOR || 'vi';
    const childProcess = await import('node:child_process');
    const editorArgs = editor.split(' ');
    const editorCommand = editorArgs.shift()!;
    const res = childProcess.spawnSync(editorCommand, [...editorArgs, configPath], { stdio: 'inherit' });
    res.status !== 0 && process.exit(res.status);
    return loadConfig({ configPath });
  }

  return loadConfig({ configPath });
}
