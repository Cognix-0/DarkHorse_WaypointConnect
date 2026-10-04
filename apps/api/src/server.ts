import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth.ts';
import { dispatchRoutes } from './routes/dispatch.ts';
import { insightRoutes } from './routes/insights.ts';
import { liveRoutes } from './routes/live.ts';
import { loaderRoutes } from './routes/loader.ts';
import { driverRoutes } from './routes/driver.ts';
import { storeRoutes } from './routes/store.ts';
import { HttpError } from './plans.ts';
import { prisma } from './db.ts';
import { today } from './reference.ts';
import { buildDemoDay } from '../../../prisma/demo-day.ts';

// bodyLimit: driver sync batches carry small photos and signatures.
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 8 * 1024 * 1024 });
await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me' });

// One error shape for the web app: { error: "plain sentence", ...details }
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...err.extra });
  if (err instanceof ZodError || (err as { name?: string }).name === 'ZodError') return reply.code(400).send({ error: (err as ZodError).issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') });
  app.log.error(err);
  const error = err as { statusCode?: number; message?: string };
  const status = error.statusCode ?? 500;
  return reply.code(status).send({ error: status === 500 ? 'Something went wrong on the server. Try again.' : error.message ?? 'Request failed' });
});

// Every screen shows today. The first request of a new day builds that day's orders (once per day and process).
const builtDays = new Map<string, Promise<boolean>>();
const ensureToday = () => {
  const date = today();
  let job = builtDays.get(date);
  if (!job) {
    job = buildDemoDay(prisma, date).catch((err) => { builtDays.delete(date); app.log.error(err); return false; });
    builtDays.set(date, job);
  }
  return job;
};

// Every route lives under /api (Caddy forwards /api/* here).
await app.register(async (api) => {
  api.addHook('onRequest', async () => { await ensureToday(); });
  api.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, at: new Date().toISOString() };
  });
  await api.register(authRoutes);
  await api.register(dispatchRoutes);
  await api.register(liveRoutes);
  await api.register(insightRoutes);
  await api.register(loaderRoutes);
  await api.register(driverRoutes);
  await api.register(storeRoutes);
}, { prefix: '/api' });

const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
