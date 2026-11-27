import z from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ServerContext } from "../context.js";
import { getTfeEnvStatus } from "../../lifecycle/status.js";
import { json, ok, text } from "../result.js";
import { showConfig } from "../../lifecycle/config.js";
import { tfeEnvInfo } from "../../lifecycle/info.js";
import { withLock } from "../../lock.js";
import { startTfeEnv } from "../../lifecycle/start.js";
import { progressReporter } from "../progress.js";
import { Extra } from "../progress.js";
import { stopTfeEnv } from "../../lifecycle/stop.js";
import { renewTfeEnvCert } from "../../lifecycle/renew.js";

export function registerEnvTools(server: McpServer, ctx: ServerContext) {
  const { safe, logger } = ctx;

  const configInput = {
    config: z.string().optional().describe('Path to the tfe-env configuration'),
  };

  server.registerTool(
    'tfe_env_status',
    {
      title: 'tfe-env environment status',
      description: 'Container state, uptime, readiness of TFE application',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async () => json(await getTfeEnvStatus(logger)))
  )

  server.registerTool(
    'tfe_env_config',
    {
      title: 'tfe-env configuration',
      description: 'Retrieve the tfe-env configuration',
      inputSchema: {
        ...configInput,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ config }) => text(JSON.stringify(await showConfig(false, config), null, 2)))
  )

  server.registerTool(
    'tfe_env_info',
    {
      title: 'tfe-env resolved info',
      description: 'Print resolved tfe-env environment information (env vars, ports, image tag, working directory)',
      inputSchema: {
        ...configInput,
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async ({ config }) => text(JSON.stringify(await tfeEnvInfo(config), null, 2)))
  )

  if (ctx.allowDestructive) {
    server.registerTool(
      'tfe_env_start',
      {
        title: 'Start TFE environment',
        description: 'Start the tfe-env environment',
        inputSchema: {
          ...configInput
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      safe(async ({ config }, extra) => {
        await withLock('start', () => startTfeEnv(logger, config, progressReporter(extra)));
        return ok();
      })
    )

    server.registerTool(
      'tfe_env_stop',
      {
        title: 'Stop TFE environment',
        description: 'Stop the tfe-env environment',
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      safe(async (extra: Extra) => {
        await withLock('stop', () => stopTfeEnv(logger, progressReporter(extra)));
        return ok();
      })
    )

    server.registerTool(
      'tfe_env_renew_cert',
      {
        title: 'Renew TFE certificate',
        description: 'Renew the tfe-env Let\'s Encrypt certificate',
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        }
      },
      safe(async () => {
        await withLock('stop', () => renewTfeEnvCert(logger));
        return ok();
      })
    )
  }
};
