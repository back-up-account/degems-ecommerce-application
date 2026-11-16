import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const backendApiUrl = process.env.BACKEND_API_URL ?? 'http://localhost:3003';
const backendUrl = new URL(backendApiUrl);

if (backendUrl.username || backendUrl.password || backendUrl.pathname !== '/'
  || (process.env.BACKEND_API_URL && process.env.NODE_ENV === 'production' && backendUrl.protocol !== 'https:')) {
  throw new Error('BACKEND_API_URL must be an HTTPS origin without credentials or a path in production.');
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${backendUrl.origin}/api/:path*`,
        },
      ],
      fallback: [
        {
          source: '/account/:path*',
          destination: `${backendUrl.origin}/account/:path*`,
        },
        {
          source: '/invoice/:path*',
          destination: `${backendUrl.origin}/invoice/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
