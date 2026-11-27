import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createStderrLogger } from "../util/logger.js";
import { registerAppTools } from "./tools/app.js";
import { createServerContext } from "./context.js";
import { registerEnvTools } from "./tools/env.js";
import { registerLogsTools } from "./tools/logs.js";

export async function serveMcp(
  version: string,
  allow_destructive: boolean = false,
  allow_secrets: boolean = false,
): Promise<void> {
  const server = new McpServer({ name: 'tfe-env', version })

  const ctx = createServerContext(createStderrLogger(), {
    allowDestructive: allow_destructive,
    allowSecrets: allow_secrets
  });

  registerEnvTools(server, ctx);
  registerAppTools(server, ctx);
  registerLogsTools(server, ctx);

  await server.connect(new StdioServerTransport());
};
