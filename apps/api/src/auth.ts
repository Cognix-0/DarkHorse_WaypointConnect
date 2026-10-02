import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TSessionUser } from '@waypoint/shared/contract';

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
  if (roles.length && !roles.includes(req.user.role)) {
    return reply.code(403).send({ error: `This action is for ${roles.join(' or ')} accounts.` });
  }
};
