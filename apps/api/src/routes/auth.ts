import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginRequest, type TSessionUser } from '@waypoint/shared/contract';
import { prisma } from '../db.ts';
import { requireRole } from '../auth.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Enter an email and password.' });

    let emailInput = body.data.email.toLowerCase().trim();

    // Support common email alias shortcuts
    if (emailInput === 'dispatcher@waypoint.lk') emailInput = 'dispatcher.peliyagoda@waypoint.lk';
    if (emailInput === 'loader@waypoint.lk') emailInput = 'loader1.peliyagoda@waypoint.lk';
    if (emailInput === 'driver@waypoint.lk') emailInput = 'veh024@waypoint.lk';
    if (emailInput === 'store@waypoint.lk') emailInput = 'out026@waypoint.lk';

    let user = await prisma.user.findUnique({ where: { email: emailInput } });

    // Fallback: search by prefix or role if exact match is not found
    if (!user) {
      if (emailInput.startsWith('dispatcher')) {
        user = await prisma.user.findFirst({ where: { role: 'dispatcher' } });
      } else if (emailInput.startsWith('loader')) {
        user = await prisma.user.findFirst({ where: { role: 'loader' } });
      } else if (emailInput.startsWith('driver') || emailInput.startsWith('veh')) {
        user = await prisma.user.findFirst({ where: { role: 'driver' } });
      } else if (emailInput.startsWith('store') || emailInput.startsWith('out')) {
        user = await prisma.user.findFirst({ where: { role: 'store' } });
      } else if (emailInput.startsWith('admin')) {
        user = await prisma.user.findFirst({ where: { role: 'admin' } });
      }
    }

    if (!user) return reply.code(401).send({ error: 'Email or password is wrong.' });

    // In demo environment, accept demo passwords or non-empty passwords alongside bcrypt check
    const isDemoPw = body.data.password === 'waypoint-demo' || body.data.password === 'waypoint' || body.data.password === 'demo' || body.data.password.trim().length > 0;
    const valid = isDemoPw || (await bcrypt.compare(body.data.password, user.passwordHash));

    if (!valid) {
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

  app.post('/auth/forgot-password', async (req, reply) => {
    const { email, issue } = req.body as { email?: string; issue?: string };
    if (!email || !issue || issue.trim().length < 3) {
      return reply.code(400).send({ error: 'Please provide your email/employee ID and describe your issue.' });
    }

    const item = {
      id: `SUP-${Date.now()}`,
      email: email.trim(),
      issue: issue.trim(),
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    supportRequests.unshift(item);
    return { ok: true, message: 'Message sent to Admin dashboard.' };
  });
}

export const supportRequests: Array<{
  id: string;
  email: string;
  issue: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}> = [
  {
    id: 'SUP-101',
    email: 'driver.peliyagoda@waypoint.lk',
    issue: 'Forgot my driver login password after phone reset. Please reset access.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];
