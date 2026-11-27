import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { Logger } from "../util/logger.js";
import { fail } from "./result.js";

/** Wraps a tool handler so anything it throws becomes an `isError` result instead of a protocol error. */
export type Safe = <Args extends unknown[]>(
  fn: (...args: Args) => Promise<CallToolResult>,
) => (...args: Args) => Promise<CallToolResult>;

/** State shared by every tool module, built once in `serveMcp`. */
export interface ServerContext {
  logger: Logger;
  safe: Safe;
  /** `--allow-destructive`: register tools that stop or replace the environment. */
  allowDestructive: boolean;
  /** `--allow-secrets`: allow tools to return unredacted secret values. */
  allowSecrets: boolean;
}

export const makeSafe = (logger: Logger): Safe =>
  (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      logger.error(`tool failed: ${e instanceof Error ? e.stack : String(e)}`);
      return fail(e);
    }
  };

export function createServerContext(
  logger: Logger,
  opts: { allowDestructive: boolean; allowSecrets: boolean },
): ServerContext {
  return { logger, safe: makeSafe(logger), ...opts };
}
