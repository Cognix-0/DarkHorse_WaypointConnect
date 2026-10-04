// Realtime refresh for every role: a Server-Sent Events stream of "something changed" signals.
// The signal carries no business data; each screen refetches what it shows (with the user's own access).
import type { FastifyInstance } from 'fastify';
import type { TChangeSignal, TSessionUser } from '@waypoint/shared/contract';
import { prisma } from '../db.ts';
import { bus } from '../events.ts';

export async function realtimeRoutes(app: FastifyInstance) {
  // EventSource cannot send headers, so the token comes in the query string (as for /events).
  app.get('/changes', async (req, reply) => {
    const token = (req.query as { token?: string }).token ?? '';
    let user: TSessionUser;
    try { user = app.jwt.verify<TSessionUser>(token); } catch { return reply.code(401).send({ error: 'Sign in again' }); }
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true } });
    if (!row?.active) return reply.code(401).send({ error: 'This account is switched off.' });

    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    // retry: how soon the browser reconnects after the connection drops
    reply.raw.write('retry: 3000\n: connected\n\n');
    const send = (sig: TChangeSignal) => reply.raw.write(`data: ${JSON.stringify(sig)}\n\n`);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    bus.on('changed', send);
    req.raw.on('close', () => { clearInterval(ping); bus.off('changed', send); });
    return reply;
  });
}
