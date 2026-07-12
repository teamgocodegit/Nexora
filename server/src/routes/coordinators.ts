import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, requireHackathonAccess, AuthRequest } from '../middleware/auth';

export const coordinatorsRouter = Router({ mergeParams: true });
coordinatorsRouter.use(authenticate);
coordinatorsRouter.use(requireHackathonAccess);

coordinatorsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const assignments = await prisma.coordinatorAssignment.findMany({
      where: { hackathonId: req.params.hackathonId! },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true } },
        _count: { select: { teams: true } },
      },
    });
    res.json(assignments.map((a) => ({ assignmentId: a.id, ...a.user, assignedTeamCount: a._count.teams })));
  } catch { res.status(500).json({ error: 'Failed to fetch coordinators' }); }
});

coordinatorsRouter.delete('/:assignmentId', requireAdmin, async (req, res) => {
  try {
    await prisma.coordinatorAssignment.delete({ where: { id: req.params.assignmentId } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to remove coordinator' }); }
});
