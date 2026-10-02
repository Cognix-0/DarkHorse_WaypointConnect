import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginRequest, type TSessionUser } from '@waypoint/shared/contract';
import { prisma } from '../db.ts';
import { requireRole } from '../auth.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Enter an email and password.' });
    const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Email or password is wrong.' });
    }
    const session: TSessionUser = { id: user.id, name: user.name, role: user.role, depot: user.depot, outletId: user.outletId, vehicleId: user.vehicleId };
    return { token: app.jwt.sign(session, { expiresIn: '12h' }), user: session };
  });

  app.get('/auth/me', { preHandler: requireRole() }, async (req) => req.user);
}
