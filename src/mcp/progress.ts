import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import type { ProgressCallback } from "../cli/types.js";

export type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Adapts MCP progress notifications to the lifecycle `ProgressCallback`.
 * Returns undefined when the client did not ask for progress (no progressToken),
 * so lifecycle code can skip reporting entirely.
 */
export const progressReporter = (extra: Extra): ProgressCallback | undefined => {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return undefined;

  let progress = 0;
  return (message) => {
    // `progress` must increase with each notification. Sending is best effort: a dropped
    // progress update must not fail the operation.
    extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress: ++progress, message },
    }).catch(() => { });
  };
};
