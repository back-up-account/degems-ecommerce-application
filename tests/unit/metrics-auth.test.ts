import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMetricsBearerToken } from '@/lib/metrics-auth';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('metrics bearer token configuration', () => {
  it('prefers a mounted secret file and trims its trailing newline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'degems-metrics-'));
    const tokenPath = join(directory, 'token');
    try {
      await writeFile(tokenPath, 'mounted-secret-with-more-than-32-characters\n');
      vi.stubEnv('METRICS_BEARER_TOKEN', 'environment-secret-with-more-than-32-characters');
      vi.stubEnv('METRICS_BEARER_TOKEN_FILE', tokenPath);

      expect(await getMetricsBearerToken()).toBe('mounted-secret-with-more-than-32-characters');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses the environment variable when no secret file is configured', async () => {
    vi.stubEnv('METRICS_BEARER_TOKEN_FILE', '');
    vi.stubEnv('METRICS_BEARER_TOKEN', 'environment-secret-with-more-than-32-characters');

    expect(await getMetricsBearerToken()).toBe('environment-secret-with-more-than-32-characters');
  });
});
