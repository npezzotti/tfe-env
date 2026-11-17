import { Resolver } from "dns/promises";

export async function waitForTxtPropagation(name: string, value: string, timeoutMs: number): Promise<void> {
  const resolver = new Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const records = await resolver.resolveTxt(name);
      if (records.flat().includes(value)) return;
    } catch (err) {
      // retry
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`TXT record "${name}" did not propagate within ${timeoutMs}ms`);
}
