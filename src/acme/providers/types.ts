import { AcmeConfig } from "../../config/schema.js";
import { createManualProvider } from "./manual.js";
import { createRoute53Provider } from "./route53.js";

export interface DnsProvider {
  /** Create a TXT record with the given name and value. Returns a record ID or opaque handle. */
  createTxtRecord(name: string, value: string): Promise<string>;
  /** Delete the record created by createTxtRecord. */
  deleteTxtRecord(handle: string): Promise<void>;
  /** Wait until the TXT record is resolvable (DNS propagation). */
  waitForPropagation(name: string, value: string, timeoutMs: number): Promise<void>;
}

export function createDnsProvider(config: AcmeConfig): DnsProvider {
  if (config?.challenge !== 'dns-01') {
    throw new Error('Received a dns-01 challenge but ACME config challenge is not "dns-01"');
  }
  switch (config.dnsProvider) {
    case 'manual':
      return createManualProvider(config.dnsProviderConfig);
    case 'route53':
      return createRoute53Provider(config.dnsProviderConfig);
    default:
  }
  throw new Error("Unsupported DNS provider for dns-01 challenge.")
}
