import { Authorization } from "acme-client";
import { createServer, Server } from 'node:http';

import { AcmeConfig } from "../config/schema.js";
import { createDnsProvider } from "./providers/types.js";
import { Challenge } from "acme-client/types/rfc8555.js";

export interface ChallengeHandler {
  create(authz: Authorization, challenge: Challenge, keyAuthorization: string): Promise<void>;
  remove(authz: Authorization, challenge: Challenge, keyAuthorization: string): Promise<void>;
}

export function createChallengeHandler(config: AcmeConfig): ChallengeHandler {
  const challenge: string | undefined = config?.challenge;
  switch (challenge) {
    case 'dns-01': return createDns01Handler(config);
    case 'http-01': return createHttp01Handler();
    default:
      throw new Error(`Unsupported challenge ${challenge}`);
  }
}

function createDns01Handler(config: AcmeConfig): ChallengeHandler {
  const dns = createDnsProvider(config);
  const handles = new Map<string, string>();

  return {
    async create(authz, challenge, keyAuthorization): Promise<void> {
      if (challenge.type !== 'dns-01') throw new Error(`Expected dns-01, got ${challenge.type}`);
      const recordName = `_acme-challenge.${authz.identifier.value}`;
      const handle = await dns.createTxtRecord(recordName, keyAuthorization);
      handles.set(challenge.url, handle);
      await dns.waitForPropagation(recordName, keyAuthorization, 300000);
    },
    async remove(_authz, challenge): Promise<void> {
      const handle = handles.get(challenge.url);
      if (handle) {
        await dns.deleteTxtRecord(handle)
        handles.delete(challenge.url);
      }
    }
  }
}

function createHttp01Handler(): ChallengeHandler {
  const tokens = new Map<string, string>();
  let server: Server | undefined;

  return {
    async create(_authz, challenge, keyAuthorization): Promise<void> {
      if (challenge.type !== 'http-01') throw new Error(`Expected http-01, got ${challenge.type}`);
      tokens.set(challenge.token, keyAuthorization);
      if (server) return;

      const s = createServer((req, res) => {
        const path = (req.url ?? '').split('?')[0];
        const prefix = '/.well-known/acme-challenge/';
        const body = req.method === 'GET' && path?.startsWith(prefix) ? tokens.get(challenge.token) : undefined;
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(body)
      });

      await new Promise<void>((resolve, reject) => {
        s.once('error', reject);
        s.listen(80, resolve);
      });
      server = s;
    },
    async remove(_authz, challenge): Promise<void> {
      tokens.delete(challenge.token);
      if (!server) return;
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => {
        s.close(() => resolve());
        s.closeAllConnections();
      });
    }
  };
}