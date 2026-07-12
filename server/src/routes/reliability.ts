import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/permissions';
import { prisma } from '../lib/prisma';
import { logActivity } from '../services/reliability/activityLog.service';
import { softDeleteTeam, softDeleteRoom, softDeleteParticipant, restoreTeam, restoreRoom, restoreParticipant, calculateTeamDeleteImpact, getDeletedRecords, checkTeamDeleteGuard } from '../services/reliability/softDelete.service';
import { createSnapshot, verifySnapshotIntegrity, planRestore, listSnapshots } from '../services/reliability/snapshot.service';
import { generateEmergencyPdf } from '../services/reliability/pdfExport.service';
import { checkIntegrity } from '../services/reliability/integrity.service';
import { exportTeamsCsv, exportParticipantsCsv, exportCheckinCsv, exportRoomsCsv, exportScoresCsv, generateEmergencyPack, generateEmergencyPackZip } from '../services/reliability/export.service';
import { findStuckJobs, recoverStuckImport, recoverStuckCampaign } from '../services/reliability/stuckJobs.service';

export const reliabilityRouter = Router({ mergeParams: true });

reliabilityRouter.use(authenticate);
reliabilityRouter.use(requireSuperAdmin);

/* ───── Integrity Check ───── */
reliabilityRouter.get('/integrity', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;
    const report = await checkIntegrity(hackathonId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Soft Delete: Team ───── */
reliabilityRouter.get('/delete/team/:teamId/impact', async (req: Request, res: Response) => {
  try {
    const impact = await calculateTeamDeleteImpact(req.params.teamId!);
    res.json(impact);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

reliabilityRouter.delete('/delete/team/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { reason } = req.body || {};
    const hackathonId = req.params.hackathonId!;
    const userId = (req as any).user!.id;

    await softDeleteTeam(teamId, hackathonId, userId, reason);

    await logActivity({
      action: `Team soft-deleted`,
      hackathonId,
      actorId: userId,
      entityType: 'Team',
      entityId: teamId,
      metadata: { reason: reason || null },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.post('/restore/team/:teamId', async (req: Request, res: Response) => {
  try {
    await restoreTeam(req.params.teamId!);
    await logActivity({
      action: `Team restored from soft delete`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'Team',
      entityId: req.params.teamId!,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ───── Soft Delete: Room ───── */
reliabilityRouter.delete('/delete/room/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { reason } = req.body || {};
    const hackathonId = req.params.hackathonId!;
    const userId = (req as any).user!.id;

    const result = await softDeleteRoom(roomId, hackathonId, userId, reason);

    await logActivity({
      action: `Room soft-deleted. ${result.teamsReassigned} teams reassigned.`,
      hackathonId,
      actorId: userId,
      entityType: 'Room',
      entityId: roomId,
      metadata: { teamsReassigned: result.teamsReassigned, reason: reason || null },
    });

    res.json({ success: true, teamsReassigned: result.teamsReassigned });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.post('/restore/room/:roomId', async (req: Request, res: Response) => {
  try {
    await restoreRoom(req.params.roomId!);
    await logActivity({
      action: `Room restored from soft delete`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'Room',
      entityId: req.params.roomId!,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ───── Delete Guard ───── */
reliabilityRouter.get('/delete/team/:teamId/guard', async (req: Request, res: Response) => {
  try {
    const result = await checkTeamDeleteGuard(req.params.teamId!);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/* ───── Soft Delete: Participant ───── */
reliabilityRouter.delete('/delete/participant/:participantId', async (req: Request, res: Response) => {
  try {
    const { participantId } = req.params;
    const { reason } = req.body || {};
    const userId = (req as any).user!.id;

    await softDeleteParticipant(participantId, userId, reason);

    await logActivity({
      action: `Participant soft-deleted`,
      hackathonId: req.params.hackathonId!,
      actorId: userId,
      entityType: 'Participant',
      entityId: participantId,
      metadata: { reason: reason || null },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.post('/restore/participant/:participantId', async (req: Request, res: Response) => {
  try {
    await restoreParticipant(req.params.participantId!);
    await logActivity({
      action: `Participant restored from soft delete`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'Participant',
      entityId: req.params.participantId!,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ───── Recovery Center ───── */
reliabilityRouter.get('/recovery', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;
    const records = await getDeletedRecords(hackathonId);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Snapshots ───── */
reliabilityRouter.post('/snapshots', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;
    const userId = (req as any).user!.id;
    const { type } = req.body || {};

    const snapshotId = await createSnapshot(hackathonId, type || 'MANUAL', userId);

    await logActivity({
      action: `Snapshot created (${type || 'MANUAL'})`,
      hackathonId,
      actorId: userId,
      entityType: 'HackathonSnapshot',
      entityId: snapshotId,
      metadata: { type: type || 'MANUAL' },
    });

    res.json({ id: snapshotId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.get('/snapshots', async (req: Request, res: Response) => {
  try {
    const snapshots = await listSnapshots(req.params.hackathonId!);
    res.json(snapshots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/snapshots/:snapshotId/verify', async (req: Request, res: Response) => {
  try {
    const result = await verifySnapshotIntegrity(req.params.snapshotId!);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.get('/snapshots/:snapshotId/restore-plan', async (req: Request, res: Response) => {
  try {
    const plan = await planRestore(req.params.snapshotId!, req.params.hackathonId!);
    res.json(plan);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ───── Hackathon Archive ───── */
reliabilityRouter.post('/archive', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;
    const userId = (req as any).user!.id;

    const hackathon = await prisma.hackathon.findUnique({ where: { id: hackathonId } });
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    await prisma.hackathon.update({
      where: { id: hackathonId },
      data: { archivedAt: new Date(), archivedById: userId },
    });

    await logActivity({
      action: `Hackathon archived`,
      hackathonId,
      actorId: userId,
      entityType: 'Hackathon',
      entityId: hackathonId,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.post('/unarchive', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;
    const userId = (req as any).user!.id;

    await prisma.hackathon.update({
      where: { id: hackathonId },
      data: { archivedAt: null, archivedById: null },
    });

    await logActivity({
      action: `Hackathon unarchived`,
      hackathonId,
      actorId: userId,
      entityType: 'Hackathon',
      entityId: hackathonId,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Stuck Jobs ───── */
reliabilityRouter.get('/stuck-jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await findStuckJobs(req.params.hackathonId!);
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.post('/stuck-jobs/import/:batchId/recover', async (req: Request, res: Response) => {
  try {
    await recoverStuckImport(req.params.batchId!);
    await logActivity({
      action: `Stuck import recovered`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'ImportBatch',
      entityId: req.params.batchId!,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

reliabilityRouter.post('/stuck-jobs/campaign/:campaignId/recover', async (req: Request, res: Response) => {
  try {
    await recoverStuckCampaign(req.params.campaignId!);
    await logActivity({
      action: `Stuck email campaign recovered`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'EmailCampaign',
      entityId: req.params.campaignId!,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ───── Exports ───── */
reliabilityRouter.get('/export/teams', async (req: Request, res: Response) => {
  try {
    const csv = await exportTeamsCsv(req.params.hackathonId!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/participants', async (req: Request, res: Response) => {
  try {
    const csv = await exportParticipantsCsv(req.params.hackathonId!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="participants.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/checkin', async (req: Request, res: Response) => {
  try {
    const csv = await exportCheckinCsv(req.params.hackathonId!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="checkin.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/rooms', async (req: Request, res: Response) => {
  try {
    const csv = await exportRoomsCsv(req.params.hackathonId!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="rooms.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/scores', async (req: Request, res: Response) => {
  try {
    const csv = await exportScoresCsv(req.params.hackathonId!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="scores.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/emergency-pack', async (req: Request, res: Response) => {
  try {
    const hackathon = await prisma.hackathon.findUnique({ where: { id: req.params.hackathonId! } });
    if (!hackathon) { res.status(404).json({ error: 'Hackathon not found' }); return; }

    const format = req.query.format as string;
    if (format === 'zip') {
      const { stream, filename } = await generateEmergencyPackZip(req.params.hackathonId!, hackathon.name);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      stream.pipe(res);
    } else {
      const pack = await generateEmergencyPack(req.params.hackathonId!);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="emergency-pack.json"');
      res.json(pack);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.get('/export/emergency-pdf', async (req: Request, res: Response) => {
  try {
    const pdf = await generateEmergencyPdf(req.params.hackathonId!);
    const hackathon = await prisma.hackathon.findUnique({ where: { id: req.params.hackathonId! } });
    const safeName = (hackathon?.name || 'hackathon').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Nexora-Report-${safeName}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Backup Metadata ───── */
reliabilityRouter.get('/backup-metadata', async (req: Request, res: Response) => {
  try {
    let meta = await prisma.backupMetadata.findUnique({ where: { id: 'singleton' } });
    if (!meta) {
      meta = await prisma.backupMetadata.create({ data: { id: 'singleton' } });
    }
    res.json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.patch('/backup-metadata', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const meta = await prisma.backupMetadata.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...req.body, updatedBy: userId },
      update: { ...req.body, updatedBy: userId },
    });
    res.json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Reliability Health ───── */
reliabilityRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const hackathonId = req.params.hackathonId!;

    const [
      hackathon,
      teamCount,
      participantCount,
      checkedInCount,
      latestSnapshot,
      integrityReport,
      stuckJobs,
      emailCampaigns,
    ] = await Promise.all([
      prisma.hackathon.findUnique({
        where: { id: hackathonId },
        select: { id: true, name: true, status: true, archivedAt: true },
      }),
      prisma.team.count({ where: { hackathonId, deletedAt: null } }),
      prisma.participant.count({ where: { team: { hackathonId }, deletedAt: null } }),
      prisma.team.count({ where: { hackathonId, status: 'CHECKED_IN', deletedAt: null } }),
      prisma.hackathonSnapshot.findFirst({
        where: { hackathonId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, createdAt: true, checksum: true },
      }),
      checkIntegrity(hackathonId).catch(() => ({ overall: 'UNKNOWN' as const, issues: [], healthy: false })),
      findStuckJobs(hackathonId).catch(() => []),
      prisma.emailCampaign.count({ where: { hackathonId, status: { in: ['QUEUED', 'PROCESSING'] } } }),
    ]);

    const dbHealthy = await prisma.$queryRaw`SELECT 1 as ok`.then(() => true).catch(() => false);

    res.json({
      dbConnectivity: dbHealthy ? 'HEALTHY' : 'CRITICAL',
      apiHealthy: true,
      hackathon: hackathon ? {
        id: hackathon.id,
        name: hackathon.name,
        status: hackathon.status,
        archived: !!hackathon.archivedAt,
      } : null,
      teamCount,
      participantCount,
      checkinProgress: teamCount > 0 ? Math.round((checkedInCount / teamCount) * 100) : 0,
      lastSnapshot: latestSnapshot ? {
        id: latestSnapshot.id,
        type: latestSnapshot.type,
        createdAt: latestSnapshot.createdAt,
        integrity: latestSnapshot.checksum ? 'UNVERIFIED' : 'NONE',
      } : null,
      integrityStatus: integrityReport.overall,
      stuckJobsCount: stuckJobs.length,
      activeEmailCampaigns: emailCampaigns,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
