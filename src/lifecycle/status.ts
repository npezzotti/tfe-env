import prettyMilliseconds from "pretty-ms";
import type { ProgressCallback } from "../cli/types.js";
import { checkDockerRunning, findContainerStatus, getContainerUptime } from "../docker/client.js";
import { isTerminalStatus, TfeEnvStatus } from "../state/schema.js";
import { readState } from "../state/store.js";
import { Logger } from "../util/logger.js";

const HEALTH_URL = "http://127.0.0.1:80/api/v1/health/readiness";
const HEALTH_TIMEOUT_MS = 4000;

const START_HINT = "Run 'tfe-env start' to create it.";

/** "healthy" = HTTP 200 from readiness endpoint.
 *  "unhealthy" = container is running but the endpoint returned a non-200 response.
 *  "unknown" = health could not be determined (container not running, network error, timeout). */
export type HealthStatus = "healthy" | "unhealthy" | "unknown";

export interface TfeEnvStatusReport {
  status: TfeEnvStatus;
  /** Docker state string e.g. "running", "exited", or "not found" when the container doesn't exist. */
  containerStatus: string;
  uptime?: string;
  health: HealthStatus;
}

/**
 * Retrieves the current status of the Terraform Enterprise environment, including container state, uptime, and health.
 * @param onProgress A ProgressCallback to update the spinner
 * @returns A Promise that resolves to a TfeEnvStatusReport containing the current status of the Terraform Enterprise environment
 */
export async function getTfeEnvStatus(logger: Logger, onProgress?: ProgressCallback): Promise<TfeEnvStatusReport> {
  await checkDockerRunning();
  
  const state = readState();
  if (!state) {
    throw new Error(`Terraform Enterprise environment does not exist. ${START_HINT}`);
  }

  const { status, containerName } = state;
  if (isTerminalStatus(status)) {
    throw new Error(`Terraform Enterprise environment is ${status}. ${START_HINT}`);
  }

  if (status === "stopped") {
    return { status, containerStatus: "not found", health: "unknown" };
  }

  if (!containerName) {
    throw new Error("Terraform Enterprise environment is not running. " + START_HINT);
  }

  onProgress?.("Checking container state");
  const containerStatus = (await findContainerStatus(containerName)) ?? "not found";
  const isRunning = containerStatus === "running";

  onProgress?.("Gathering uptime and checking application health");
  const [uptimeMs, health] = await Promise.all([
    isRunning ? getContainerUptime(containerName) : Promise.resolve(undefined),
    isRunning ? checkHealth() : Promise.resolve("unknown" as HealthStatus),
  ]);
  const uptime = uptimeMs ? prettyMilliseconds(uptimeMs) : undefined;

  return { status, containerStatus, uptime, health };
}

/**
 * Checks the health of the Terraform Enterprise environment by querying the readiness endpoint.
 * @returns A Promise that resolves to a HealthStatus.
 */
async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok ? "healthy" : "unhealthy";
  } catch {
    return "unknown";
  }
}
