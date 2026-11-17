import { Ora } from "ora";
import { createInterface } from 'readline';

import { ProgressCallback, PromptCallback } from './types.js';
import chalk from "chalk";

export function makeProgressCallback(spinner: Ora): ProgressCallback {
  return (msg) => { spinner.text = msg; };
}

export function makePromptCallback(spinner: Ora): PromptCallback {
  return (question) => new Promise((resolve) => {
    spinner.stop();
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.bold(question), (answer) => { rl.close(); spinner.start(); resolve(answer); });
  });
}
