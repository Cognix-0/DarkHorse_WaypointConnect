import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { authRoutes } from './routes/auth.ts';
import { prisma } from './db.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me' });

// Every route lives under /api (Caddy forwards /api/* here).
await app.register(async (api) => {
  api.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, at: new Date().toISOString() };
  });
  await api.register(authRoutes);
  // Part 2 registers: orders, plans, loader, driver, sync, store, events.
}, { prefix: '/api' });

const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
