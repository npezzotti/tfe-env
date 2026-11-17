import { z } from 'zod';

const TERMINAL_STATUSES: ReadonlySet<string> = new Set<TfeEnvStatus>(['destroyed']);

/**
 * Checks if the given Terraform Enterprise environment status is terminal.
 * @param status The Terraform Enterprise environment status to check
 * @returns True if the status is terminal, false otherwise
 */
export function isTerminalStatus(status: TfeEnvStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const TfeEnvStatus = z.enum(['starting', 'running', 'stopped', 'stopping', 'errored', 'destroyed']);
export type TfeEnvStatus = z.infer<typeof TfeEnvStatus>;

export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  status: TfeEnvStatus,
  containerName: z.string().nullable(),
  containerId: z.string().nullable(),
  hostname: z.string().optional(),
  configHash: z.string().optional(), // sha256 of the drift-relevant fields
  startedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export type TfeEnvState = z.infer<typeof stateSchema>;
