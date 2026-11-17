import {
  ChangeAction,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  Route53Client,
  waitUntilResourceRecordSetsChanged
} from "@aws-sdk/client-route-53";

import { waitForTxtPropagation } from "./dns-utils.js";
import { DnsProvider } from "./types.js";

class Route53DnsProvider implements DnsProvider {
  private readonly client: Route53Client;
  private readonly zoneId?: string;

  constructor(cfg: Record<string, string>) {
    this.client = new Route53Client(cfg.region ? {
      region: cfg.region
    } : {});
    this.zoneId = cfg.hostedZoneId;
  }

  async createTxtRecord(name: string, value: string): Promise<string> {
    const zoneId = await this.resolveZoneId(name);
    const changeId = await this.change(zoneId, ChangeAction.UPSERT, name, value)
    await this.waitForChange(changeId);
    return JSON.stringify({ zoneId, name, value })
  }

  async deleteTxtRecord(handle: string): Promise<void> {
    const { zoneId, name, value } = JSON.parse(handle) as {
      zoneId: string; name: string; value: string;
    };

    await this.change(zoneId, ChangeAction.DELETE, name, value);
  }

  waitForPropagation(name: string, value: string, timeoutMs: number): Promise<void> {
    return waitForTxtPropagation(name, value, timeoutMs)
  }

  private async resolveZoneId(recordName: string): Promise<string> {
    if (this.zoneId) return this.zoneId;

    const segments = recordName.split('.');
    for (let i = 0; i < segments.length - 1; i++) {
      const candidate = segments.slice(i).join('.') + '.';
      const res = await this.client.send(new ListHostedZonesByNameCommand({
        DNSName: candidate,
        MaxItems: 1,
      }));
      const zone = res.HostedZones?.[0];
      if (zone?.Name === candidate) return zone.Id!.replace(/^\/hostedzone\//, '');
    }
    throw new Error(`No Route53 hosted zone found for ${recordName}`)
  }

  private async change(
    zoneId: string,
    changeAction: ChangeAction,
    name: string,
    value: string,
  ): Promise<string> {
    const res = await this.client.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      ChangeBatch: {
        Changes: [{
          Action: changeAction,
          ResourceRecordSet: {
            Name: name,
            Type: 'TXT',
            TTL: 60,
            ResourceRecords: [{ Value: `"${value}"` }],
          },
        }],
      },
    }));
    return res.ChangeInfo!.Id!
  }

  private async waitForChange(changeId: string): Promise<void> {
    await waitUntilResourceRecordSetsChanged(
      { client: this.client, maxWaitTime: 120 },
      { Id: changeId },
    );
  }
}

export function createRoute53Provider(cfg: Record<string, string>) {
  return new Route53DnsProvider(cfg);
}
