export interface WaitHealthyOptions {
  port: number;
  timeoutMs?: number;
  intervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Polls the TFE ping endpoint until it responds 200 OK, or throws after the timeout. */
export async function waitHealthy(options: WaitHealthyOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 5000;
  const url = `http://127.0.0.1:${options.port}/api/v1/health/readiness`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(intervalMs);
  }

  throw new Error(`TFE did not become healthy within ${Math.round(timeoutMs / 1000)}s`);
}
