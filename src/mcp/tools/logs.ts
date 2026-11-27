import z from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServerContext } from "../context.js";
import { TailBuffer } from "../../util/output.js";
import { logsTfeEnv } from "../../lifecycle/logs.js";
import { text } from "../result.js";

export function registerLogsTools(server: McpServer, ctx: ServerContext) {
  const { safe, logger } = ctx;
  server.registerTool(
    'tfe_env_logs',
    {
      title: 'TFE logs',
      description: 'Retrieve logs from the Terraform Enterprise environment',
      inputSchema: {
        tail: z.number().int().min(0).max(200).optional().describe('Number of lines to show from the end of the logs (default "all", capped at 20 KB)'),
        since: z.string().optional().describe('Show logs since timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'),
        until: z.string().optional().describe('Show logs before a timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async ({ tail, since, until }) => {
      const buf = new TailBuffer()
      await logsTfeEnv({
        since: since,
        until: until,
        tail: tail,
        follow: false,
        sink: {
          stdout: buf,
          stderr: buf,
        },
      }, logger);
      return text(buf.textWithNotice());
    }),
  )
};
