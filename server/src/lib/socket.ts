import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { logger } from './logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const ALLOWED_ALGORITHMS = ['HS256'];

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    name: string;
    email?: string;
    role: string;
  };
  authorizedHackathons?: Set<string>;
}

export const setupSocketHandlers = (io: Server) => {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token as string;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ALLOWED_ALGORITHMS }) as any;
      const userId = decoded.sub;

      if (!userId) {
        return next(new Error('Invalid token payload'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      if (!user.isActive) {
        return next(new Error('Account is deactivated'));
      }

      socket.user = {
        id: user.id,
        name: user.name,
        email: user.email || undefined,
        role: user.role,
      };

      if (user.role === 'SUPER_ADMIN') {
        const hackathons = await prisma.hackathon.findMany({ select: { id: true } });
        socket.authorizedHackathons = new Set(hackathons.map(h => h.id));
      } else {
        const assignments = await prisma.coordinatorAssignment.findMany({
          where: { userId: user.id },
          select: { hackathonId: true },
        });
        socket.authorizedHackathons = new Set(assignments.map(a => a.hackathonId));
      }

      next();
    } catch (err: any) {
      logger.warn(`[WS] Authentication failed: ${err.message}`);
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`[WS] Connected: ${socket.id} (${socket.user?.name || 'anonymous'})`);

    socket.on('join:hackathon', (hackathonId: string) => {
      if (!socket.authorizedHackathons?.has(hackathonId)) {
        logger.warn(`[WS] Unauthorized join attempt: ${socket.id} -> hackathon:${hackathonId}`);
        socket.emit('error', { message: 'Not authorized for this hackathon' });
        return;
      }
      socket.join(`hackathon:${hackathonId}`);
      logger.info(`[WS] ${socket.user?.name} joined hackathon:${hackathonId}`);
    });

    socket.on('leave:hackathon', (hackathonId: string) => {
      socket.leave(`hackathon:${hackathonId}`);
      logger.info(`[WS] ${socket.user?.name} left hackathon:${hackathonId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[WS] Disconnected: ${socket.id} (${socket.user?.name || 'anonymous'})`);
    });
  });
};

export const emitToHackathon = (io: Server, hackathonId: string, event: string, payload: unknown) => {
  io.to(`hackathon:${hackathonId}`).emit(event, { hackathonId, payload });
};
