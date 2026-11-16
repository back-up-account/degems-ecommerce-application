export async function register() {
  if (
    process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PHASE === 'phase-production-build'
    || process.env.NEXT_RUNTIME !== 'nodejs'
  ) return;

  // Keep the Node-only configuration check out of the Edge instrumentation bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getProductionEnvironmentErrors } = require('./lib/production-config') as typeof import('./lib/production-config');
  const errors = await getProductionEnvironmentErrors();
  if (errors.length > 0) {
    throw new Error(`Production configuration is incomplete:\n- ${errors.join('\n- ')}`);
  }
}
