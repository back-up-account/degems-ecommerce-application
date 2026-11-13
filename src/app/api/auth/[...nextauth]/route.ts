import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth';
import { instrumentHttpHandler } from '@/lib/http-metrics';

const handler = NextAuth(authConfig);

export const GET = instrumentHttpHandler('/api/auth/[...nextauth]', 'GET', handler);
export const POST = instrumentHttpHandler('/api/auth/[...nextauth]', 'POST', handler);
