import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginRequest, type TSessionUser } from '@waypoint/shared/contract';
import { prisma } from '../db.ts';
import { requireRole } from '../auth.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Enter an email and password.' });

    // Short names for the walkthrough accounts. They still need that account's own password.
    const ALIASES: Record<string, string> = {
      'loader@waypoint.lk': 'loader1.peliyagoda@waypoint.lk',
      'driver@waypoint.lk': 'veh024@waypoint.lk',
      'store@waypoint.lk': 'out026@waypoint.lk',
    };
    const typed = body.data.email.toLowerCase().trim();
    const email = ALIASES[typed] ?? typed;

    // Exactly that account, and its own password: no fallback to another account, no shared or demo password.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Email or password is wrong.' });
    }

    if (!user.active) return reply.code(403).send({ error: 'This account is switched off. Ask your administrator to turn it back on.' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session: TSessionUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      depot: user.depot,
      outletId: user.outletId,
      vehicleId: user.vehicleId,
    };

    return { token: app.jwt.sign(session, { expiresIn: '12h' }), user: session };
  });

  app.get('/auth/me', { preHandler: requireRole() }, async (req) => req.user);
}
