import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TSessionUser } from '@waypoint/shared/contract';
import { prisma } from './db.ts';

declare module '@fastify/jwt' {
  interface FastifyJWT { user: TSessionUser }
}

/** Route guard: `preHandler: requireRole('dispatcher')`. */
export const requireRole = (...roles: TSessionUser['role'][]) => async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Sign in again: your session has expired.' });
  }
  // The admin can switch an account off at any time: its open sessions stop at the next request.
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { active: true } });
  if (!user?.active) return reply.code(401).send({ error: 'This account is switched off. Ask your administrator.' });
  if (roles.length && !roles.includes(req.user.role)) {
    return reply.code(403).send({ error: `This action is for ${roles.join(' or ')} accounts.` });
  }
};
