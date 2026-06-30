import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { enqueueMessages } from '../jobs/messageQueue';

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.use(authenticate);

messagesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const messages = await prisma.message.findMany({ where: { hackathonId: req.params.hackathonId! }, include: { sentBy: { select: { id: true, name: true } }, recipients: { include: { team: { select: { id: true, name: true } } } } }, orderBy: { sentAt: 'desc' }, take: 100 });
    res.json(messages);
  } catch { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

messagesRouter.post('/broadcast', requireAdmin, async (req: AuthRequest, res) => {
  const { content, channel, teamIds } = req.body;
  if (!content || !channel) return res.status(400).json({ error: 'content and channel required' });
  const hackathonId = req.params.hackathonId!;
  try {
    const teams = await prisma.team.findMany({ where: teamIds === 'all' ? { hackathonId } : { hackathonId, id: { in: teamIds } }, select: { id: true, name: true, leaderPhone: true } });
    const message = await prisma.message.create({ data: { content, channel, status: 'QUEUED', recipientType: teamIds === 'all' ? 'ALL' : 'SELECTED', hackathonId, sentById: req.user!.id, recipients: { create: teams.map((t) => ({ teamId: t.id, status: 'QUEUED' })) } }, include: { sentBy: { select: { id: true, name: true } }, recipients: { include: { team: { select: { id: true, name: true } } } } } });
    enqueueMessages(message.id, teams, content, channel, hackathonId, io);
    res.json({ success: true, message, queued: teams.length });
  } catch (err: any) { res.status(500).json({ error: 'Failed to broadcast', details: err.message }); }
});

messagesRouter.post('/:id/retry', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id }, include: { recipients: { where: { status: 'FAILED' }, include: { team: true } } } });
    if (!message) return res.status(404).json({ error: 'Not found' });
    enqueueMessages(message.id, message.recipients.map((r) => r.team), message.content, message.channel, req.params.hackathonId!, io);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to retry' }); }
});
