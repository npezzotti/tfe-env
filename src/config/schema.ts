import { z } from 'zod';

export const tlsSchema = z.object({
  certFile: z.string(),
  keyFile: z.string(),
  caBundle: z.string(),
});

const acmeDns01Schema = z.object({
  challenge: z.literal('dns-01'),
  dnsProvider: z.enum(['route53', 'manual']),
  dnsProviderConfig: z.record(z.string(), z.string()).default({}),
});

const acmeHttp01Schema = z.object({
  challenge: z.literal('http-01').default('http-01'),
});

export const acmeSchema = z.discriminatedUnion('challenge', [
  acmeDns01Schema,
  acmeHttp01Schema,
]).and(z.object({
  enabled: z.boolean().default(false),
  email: z.email(),
  staging: z.boolean(),
})).optional();

export const configSchema = z.object({
  image: z.string().min(1, "'image' name cannot be empty"),
  hostname: z.string().min(1, "'hostname' cannot be empty"),
  licenseKey: z.string().min(1, "'licenseKey' cannot be empty"),
  encryptionPassword: z.string().min(1, "'encryptionPassword cannot be empty"),
  iactToken: z.string().nullable().default(null),
  capacityConcurrency: z.coerce.number().nullable().default(null),
  capacityMemory: z.coerce.number().nullable().default(null),
  tfeRunPipelineImage: z.string().nullable().default(null),
  tls: tlsSchema.default({
    certFile: "/etc/ssl/private/terraform-enterprise/cert.pem",
    keyFile: "/etc/ssl/private/terraform-enterprise/key.pem",
    caBundle: "/etc/ssl/private/terraform-enterprise/bundle.pem",
  }),
  acme: acmeSchema,
});

export type TfeEnvConfig = z.infer<typeof configSchema>;
export type AcmeConfig = NonNullable<z.infer<typeof acmeSchema>>;
