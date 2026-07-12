import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

// Cache secrets for the lifetime of the warm Lambda container.
const cache = new Map<string, string>();

export async function getSecret(arn: string): Promise<string> {
  const cached = cache.get(arn);
  if (cached !== undefined) return cached;

  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = out.SecretString ?? '';
  cache.set(arn, value);
  return value;
}
