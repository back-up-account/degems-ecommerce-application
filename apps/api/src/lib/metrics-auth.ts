import { readFile } from 'node:fs/promises';

export async function getMetricsBearerToken() {
  const tokenFile = process.env.METRICS_BEARER_TOKEN_FILE;
  if (tokenFile) return (await readFile(tokenFile, 'utf8')).trim();
  return process.env.METRICS_BEARER_TOKEN ?? '';
}
