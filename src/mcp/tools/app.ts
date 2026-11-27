import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

import { execTfeContainer } from "../../lifecycle/exec.js";
import type { Logger } from "../../util/logger.js";
import { TailBuffer } from "../../util/output.js";
import { fail, text, ToolResult } from "../result.js";
import { ServerContext } from "../context.js";

export async function runTfeCtlCommand(command: string[], logger: Logger): Promise<ToolResult> {
  const stdoutBuf = new TailBuffer(128_000);
  const stderrBuf = new TailBuffer();
  const code = await execTfeContainer(
    ['tfectl', 'app', ...command],
    {
      tty: false,
      sink: {
        stdout: stdoutBuf,
        stderr: stderrBuf,
      },
    }, logger);
  const out = stdoutBuf.textWithNotice();
  const err = stderrBuf.textWithNotice();
  if (code !== 0) {
    return fail(new Error(`tfectl exited with code ${code}${err ? `: ${err.trim()}` : ''}`));
  }

  return text(err ? `${out}${out && !out.endsWith('\n') ? '\n' : ''}[stderr]\n${err}` : out);
}

export function registerAppTools(server: McpServer, ctx: ServerContext) {
  const { safe, logger } = ctx;
  server.registerTool(
    'tfe_app_diagnostics',
    {
      title: 'TFE diagnostics',
      description: 'Perform a full diagnostic check of Terraform Enterprise',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async () => runTfeCtlCommand(['diagnostics', '--json'], logger)),
  );

  const fullInput = z.boolean().optional().describe('Include the full configuration (--full)');
  const appConfigInput = ctx.allowSecrets
    ? z
      .object({
        full: fullInput,
        unredacted: z.boolean().optional().describe('Do not redact secret values (--unredacted)'),
      })
      .superRefine((value, ctx) => {
        if (value.full && value.unredacted) {
          ctx.addIssue({
            code: "custom",
            message: 'Specify only one of `full` or `unredacted`.',
          });
        }
      })
    : z.object({ full: fullInput });

  server.registerTool(
    'tfe_app_config',
    {
      title: 'TFE application configuration',
      description: ctx.allowSecrets
        ? 'Get the configuration of the Terraform Enterprise application. ' +
        'Set at most one of `full` or `unredacted`.'
        : 'Get the configuration of the Terraform Enterprise application. Secret values are redacted.',
      inputSchema: appConfigInput,
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async (args) => {
      const full = args.full === true;
      // Re-check the flag here rather than trusting the schema alone.
      const unredacted = ctx.allowSecrets && 'unredacted' in args && args.unredacted === true;
      return runTfeCtlCommand(
        ['config', ...(full ? ['--full'] : []), ...(unredacted ? ['--unredacted'] : [])],
        logger,
      );
    }),
  )

  server.registerTool(
    'tfe_app_health_readiness',
    {
      title: 'TFE application readiness',
      description: 'Get the status of the Terraform Enterprise application',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    safe(async () => await runTfeCtlCommand(['health', 'readiness', '--json'], logger)),
  )
};
