import chalk from 'chalk';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export function createLogger(debugEnabled: boolean): Logger {
  return {
    info: (message) => console.log(chalk.bold(message)),
    warn: (message) => console.warn(chalk.yellow(message)),
    error: (message) => console.error(chalk.red(message)),
    debug: (message) => {
      if (debugEnabled) console.log(chalk.gray(`[debug] ${message}`));
    }
  };
}

export function createStderrLogger(): Logger {
  const w = (m: string) => process.stderr.write(m + '\n');
  return { info: w, warn: w, error: w, debug: w };
}
