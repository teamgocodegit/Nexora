import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth';
import { hackathonsRouter } from './routes/hackathons';
import { teamsRouter } from './routes/teams';
import { coordinatorsRouter } from './routes/coordinators';
import { messagesRouter } from './routes/messages';
import { metricsRouter, activityRouter, sheetsRouter } from './routes/other';
import { certificatesRouter, verifyRouter } from './routes/certificates';
import { inviteRouter } from './routes/invites';
import { adminRouter } from './routes/admin';
import { publicRegisterRouter, adminRegistrationRouter } from './routes/register';
import { roomsRouter } from './routes/rooms';
import { automationsRouter, milestonesRouter } from './routes/automations';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { setupSocketHandlers } from './lib/socket';
import { logger } from './lib/logger';

dotenv.config();

const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const envVar of REQUIRED_ENV) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required. Copy server/.env.example to server/.env and set a secure value.`);
  }
}

if (process.env.JWT_SECRET === 'change-me-to-a-long-random-secret-min-32-chars-here!!') {
  throw new Error('JWT_SECRET must be changed from the default placeholder value. Generate a secure random string.');
}

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1);

const CLIENT_URL = process.env.CLIENT_URL || '';
const ALLOWED_ORIGINS = CLIENT_URL.split(',').filter(Boolean);

export const io = new SocketServer(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : (process.env.NODE_ENV === 'production' ? '*' : true),
    credentials: true,
  },
});

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin(origin, cb) {
    if (!origin || process.env.NODE_ENV !== 'production') return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) return cb(null, origin);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/api/certificates', verifyRouter);
app.use('/api/auth', authRouter);
app.use('/api/hackathons', hackathonsRouter);
app.use('/api/hackathons/:hackathonId/teams', teamsRouter);
app.use('/api/hackathons/:hackathonId/coordinators', coordinatorsRouter);
app.use('/api/hackathons/:hackathonId/messages', messagesRouter);
app.use('/api/hackathons/:hackathonId/certificates', certificatesRouter);
app.use('/api/hackathons/:hackathonId/metrics', metricsRouter);
app.use('/api/hackathons/:hackathonId/activity', activityRouter);
app.use('/api/hackathons/:hackathonId/sheets', sheetsRouter);
app.use('/api/invites', inviteRouter);
app.use('/api/admin', adminRouter);
app.use('/api/register', publicRegisterRouter);
app.use('/api/hackathons/:hackathonId/registrations', adminRegistrationRouter);
app.use('/api/hackathons/:hackathonId/rooms', roomsRouter);
app.use('/api/hackathons/:hackathonId/automations', automationsRouter);
app.use('/api/hackathons/:hackathonId/milestones', milestonesRouter);

app.get('/health', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', ts: new Date().toISOString() });
  }
});

app.get('/api/__info', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const safe = (v: string | undefined) => v ? `${v.slice(0, 8)}…` : undefined;
  res.json({
    node: process.version,
    env: process.env.NODE_ENV,
    origins: ALLOWED_ORIGINS,
    jwt: safe(process.env.JWT_SECRET),
    db: process.env.DATABASE_URL?.includes('@') ? `${process.env.DATABASE_URL!.split('@')[0].split(':')[0]}@${process.env.DATABASE_URL!.split('@')[1]}` : undefined,
  });
});

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`Nexora server on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

export default app;
