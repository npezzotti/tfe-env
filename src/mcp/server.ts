import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import z from "zod";

import { getTfeEnvStatus } from "../lifecycle/status.js";
import { renewTfeEnvCert } from "../lifecycle/renew.js";
import { createStderrLogger } from "../util/logger.js";
import { logsTfeEnv } from "../lifecycle/logs.js";
import { TailBuffer } from "../util/output.js";
import { execTfeContainer } from "../lifecycle/exec.js";
import { withLock } from "../lock.js";
import { startTfeEnv } from "../lifecycle/start.js";
import { stopTfeEnv } from "../lifecycle/stop.js";
import { tfeEnvInfo } from "../lifecycle/info.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
const ok = (): ToolResult => text(JSON.stringify({ result: 'success' }));
const fail = (e: unknown): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
});

export async function serveMcp(version: string, _allow_destructive: boolean = false): Promise<void> {
  const server = new McpServer({ name: 'tfe-env', version })

  const configInput = {
    config: z.string().optional().describe('Path to the tfe-env configuration'),
  };

  const logger = createStderrLogger();

  server.registerTool(
    'tfe_env_status',
    {
      description: 'Container state, uptime, readiness of TFE environment',
      annotations: { readOnlyHint: true }
    },
    async (): Promise<CallToolResult> => {
      try {
        const report = await getTfeEnvStatus(logger);
        return { content: [{ type: 'text', text: JSON.stringify(report) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_env_info',
    {
      description: 'Print resolved configuration (env vars, ports, image tag, working directory)',
      inputSchema: {
        ...configInput,
      },
      annotations: { readOnlyHint: true }
    },
    async ({ config }): Promise<CallToolResult> => {
      try {
        const report = await tfeEnvInfo(config);
        return { content: [{ type: 'text', text: JSON.stringify(report) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_env_start',
    {
      description: 'Start the tfe-env environment',
      inputSchema: {
        ...configInput
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ config }, extra): Promise<CallToolResult> => {
      const progressToken = extra._meta?.progressToken;
      let step = 0;
      const onProgress = progressToken !== undefined ? (msg: string) => {
        extra.sendNotification({
          method: "notifications/progress", params: {
            progress: step++,
            progressToken,
            message: msg
          }
        }).catch(() => { });
      } : undefined

      try {
        await withLock('start', () => startTfeEnv(
          logger,
          config,
          onProgress,
        ));
        return ok();
      } catch (e) {
        return fail(e);
      }
    }
  )

  server.registerTool(
    'tfe_env_stop',
    {
      description: 'Stop the tfe-env environment',
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (): Promise<CallToolResult> => {
      try {
        await withLock('stop', () => stopTfeEnv(
          logger,
        ));
        return ok();
      } catch (e) {
        return fail(e);
      }
    }
  )

  server.registerTool(
    'tfe_env_renew_cert',
    { description: 'Renew the tfe-env Let\'s Encrypt certificate' },
    async (): Promise<CallToolResult> => {
      try {
        await renewTfeEnvCert(logger);
        return { content: [{ type: 'text', text: JSON.stringify({ "result": "success" }, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_env_logs',
    {
      description: 'Retrieve logs from the Terraform Enterprise environment',
      inputSchema: {
        tail: z.number().int().min(0).max(200).optional().describe('Number of lines to show from the end of the logs (default "all")'),
        since: z.string().optional().describe('Show logs since timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'),
        until: z.string().optional().describe('Show logs before a timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'),
      },
      annotations: { readOnlyHint: true }
    },
    async ({ tail, since, until }): Promise<CallToolResult> => {
      try {
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
        return { content: [{ type: 'text', text: buf.text() }], truncated: buf.dropped > 0 };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_app_health_readiness',
    {
      description: 'Get the status of the Terraform Enterprise environment',
      annotations: { readOnlyHint: true }
    },
    async (): Promise<CallToolResult> => {
      try {
        const stdoutBuf = new TailBuffer();
        const stderrBuf = new TailBuffer();
        await execTfeContainer(
          ['tfectl', 'app', 'health', 'readiness', '--json'],
          {
            tty: false,
            sink: {
              stdout: stdoutBuf,
              stderr: stderrBuf,
            },
          }, logger);
        return { content: [{ type: 'text', text: stdoutBuf.text() }], truncated: stdoutBuf.dropped > 0 };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_env_app_config',
    {
      description:
        'Get the configuration of the Terraform Enterprise application. ' +
        'Set at most one of `full` or `unredacted`.',
      inputSchema: {
        full: z.boolean().optional().describe('Include the full configuration (--full)'),
        unredacted: z.boolean().optional().describe('Do not redact secret values (--unredacted)'),
      },
      annotations: { readOnlyHint: true }
    },
    async ({ full, unredacted }): Promise<CallToolResult> => {
      if (full && unredacted) {
        return { isError: true, content: [{ type: 'text', text: 'Specify only one of `full` or `unredacted`.' }] };
      }
      try {
        const cmd = ['tfectl', 'app', 'config'];
        if (full) cmd.push('--full');
        if (unredacted) cmd.push('--unredacted');
        const stdoutBuf = new TailBuffer();
        await execTfeContainer(
          cmd,
          { tty: false, sink: { stdout: stdoutBuf, stderr: new TailBuffer() } },
          logger,
        );
        return { content: [{ type: 'text', text: stdoutBuf.text() }], truncated: stdoutBuf.dropped > 0 };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  server.registerTool(
    'tfe_env_app_diagnostics',
    {
      description: 'Perform a full diagnostic check of Terraform Enterprise',
      annotations: { readOnlyHint: true }

    },
    async (): Promise<CallToolResult> => {
      try {
        const cmd = ['tfectl', 'app', 'diagnostics', '--json'];
        const stdoutBuf = new TailBuffer();
        await execTfeContainer(
          cmd,
          { tty: false, sink: { stdout: stdoutBuf, stderr: new TailBuffer() } },
          logger,
        );
        return { content: [{ type: 'text', text: stdoutBuf.text() }], truncated: stdoutBuf.dropped > 0 };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
  )

  await server.connect(new StdioServerTransport());
}
