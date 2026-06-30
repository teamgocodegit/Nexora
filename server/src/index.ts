import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth';
import { hackathonsRouter } from './routes/hackathons';
import { teamsRouter } from './routes/teams';
import { coordinatorsRouter } from './routes/coordinators';
import { messagesRouter } from './routes/messages';
import { metricsRouter, activityRouter, sheetsRouter } from './routes/other';
import { certificatesRouter, verifyRouter } from './routes/certificates';
import { inviteRouter } from './routes/invites';
import { adminRouter } from './routes/admin';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { setupSocketHandlers } from './lib/socket';
import { logger } from './lib/logger';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Copy server/.env.example to server/.env and set a secure secret.');
}

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1);

export const io = new SocketServer(httpServer, {
  cors: { origin: true
}
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true,
credentials: true }));
app.use(express.json());
app.use('/api', apiLimiter);

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

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Nexora server on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

export default app;
