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
import { adminDemoRoutes, adminRoutes } from './routes/admin.ts';
import { realtimeRoutes } from './routes/realtime.ts';
import { signalChange } from './events.ts';
import { expireDemo, loadDemo } from './demo.ts';
import { HttpError } from './plans.ts';
import type { TChangeSignal } from '@waypoint/shared/contract';

type TChangeRole = NonNullable<TChangeSignal['by']>;
import { prisma } from './db.ts';
import { today, workingDay } from './reference.ts';
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

// The first request of a new day builds that day's orders (once per day and process): today's (stores) and the
// run being worked on (from the 16:00 cutoff that is the next run, so the dispatcher can plan it).
const builtDays = new Map<string, Promise<boolean>>();
const ensureDay = (date: string) => {
  let job = builtDays.get(date);
  if (!job) {
    job = buildDemoDay(prisma, date).catch((err) => { builtDays.delete(date); app.log.error(err); return false; });
    builtDays.set(date, job);
  }
  return job;
};
const ensureToday = async () => { await ensureDay(today()); await ensureDay(workingDay()); };

// Demo mode survives a restart (Admin → Demo mode).
await loadDemo();

// Screens follow the run: at the 16:00 cutoff (and at midnight) every open screen moves on without a refresh.
// A demo whose time is up switches itself off here too.
let lastRun = `${today()}|${workingDay()}`;
setInterval(async () => {
  if (await expireDemo()) signalChange(null);
  const run = `${today()}|${workingDay()}`;
  if (run === lastRun) return;
  lastRun = run;
  void ensureToday().then(() => signalChange(null));
}, 30_000).unref();

// Every route lives under /api (Caddy forwards /api/* here).
await app.register(async (api) => {
  api.addHook('onRequest', async () => { await ensureToday(); });
  // Any successful change (store order, plan, loading, delivery, admin) refreshes every open screen.
  api.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || reply.statusCode >= 400 || req.url.startsWith('/api/auth/')) return;
    signalChange((req.user as { role?: TChangeRole } | undefined)?.role ?? null);
  });
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
  await api.register(adminRoutes);
  await api.register(adminDemoRoutes);
  await api.register(realtimeRoutes);
}, { prefix: '/api' });

const port = Number(process.env.API_PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
