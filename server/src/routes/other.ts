import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { getMetrics } from '../services/metricsService';

export const metricsRouter = Router({ mergeParams: true });
metricsRouter.use(authenticate);
metricsRouter.get('/', async (req: AuthRequest, res) => {
  try { res.json(await getMetrics(req.params.hackathonId!)); }
  catch { res.status(500).json({ error: 'Failed to fetch metrics' }); }
});

export const activityRouter = Router({ mergeParams: true });
activityRouter.use(authenticate);
activityRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const logs = await prisma.activityLog.findMany({ where: { hackathonId: req.params.hackathonId! }, include: { actor: { select: { id: true, name: true } } }, orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(logs);
  } catch { res.status(500).json({ error: 'Failed to fetch activity' }); }
});

export const sheetsRouter = Router({ mergeParams: true });
sheetsRouter.use(authenticate);
sheetsRouter.post('/sync', requireAdmin, async (req: AuthRequest, res) => {
  const { sheetId, range = 'Sheet1!A:Z' } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'sheetId required' });
  const hackathonId = req.params.hackathonId!;
  try {
    const rows: string[][] = [
      ['Timestamp', 'Team Name', 'Member 1', 'Member 2', 'Leader Phone'],
      ['2024-01-01', 'AlphaBuilders', 'John Doe', 'Jane Smith', '+919000000001'],
    ];
    if (rows.length < 2) return res.json({ created: 0, updated: 0, skipped: 0 });
    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const teamNameIdx = headers.findIndex((h) => h.includes('team'));
    const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'));
    const memberIndices = headers.map((h, i) => (h.includes('member') || (h.includes('name') && i !== teamNameIdx) ? i : -1)).filter((i) => i !== -1);
    let created = 0, updated = 0, skipped = 0;
    for (const row of rows.slice(1)) {
      const teamName = row[teamNameIdx]?.trim();
      if (!teamName) { skipped++; continue; }
      const leaderPhone = phoneIdx >= 0 ? row[phoneIdx]?.trim() : undefined;
      const memberNames = memberIndices.map((i) => row[i]?.trim()).filter(Boolean);
      try {
        const existing = await prisma.team.findFirst({ where: { hackathonId, name: teamName } });
        if (existing) { await prisma.team.update({ where: { id: existing.id }, data: { leaderPhone: leaderPhone || existing.leaderPhone } }); updated++; }
        else { await prisma.team.create({ data: { hackathonId, name: teamName, leaderPhone, participants: { create: memberNames.map((name, idx) => ({ name, isLeader: idx === 0, phone: idx === 0 ? leaderPhone : undefined })) } } }); created++; }
      } catch { skipped++; }
    }
    await prisma.activityLog.create({ data: { action: `Sheets synced: ${created} created, ${updated} updated`, hackathonId, actorId: req.user!.id } });
    res.json({ created, updated, skipped });
  } catch (err: any) { res.status(500).json({ error: 'Sheets sync failed', details: err.message }); }
});


