import NextAuth from 'next-auth';
import { authConfig } from '@api/lib/auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

const handler = NextAuth(authConfig);

export const GET = instrumentHttpHandler('/api/auth/[...nextauth]', 'GET', handler);
export const POST = instrumentHttpHandler('/api/auth/[...nextauth]', 'POST', handler);
