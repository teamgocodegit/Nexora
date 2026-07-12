import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, requireHackathonAccess, requirePermission, AuthRequest } from '../middleware/auth';
import { generateCertificates } from '../services/certificate.service';

export const verifyRouter = Router();

verifyRouter.get('/:certificateId/verify', async (req, res) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { id: req.params.certificateId },
      include: {
        team: { select: { name: true } },
        hackathon: { select: { name: true } },
      },
    });

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json({
      participantName: cert.participantName,
      teamName: cert.team.name,
      hackathonName: cert.hackathon.name,
      issueDate: (cert.generatedAt || cert.createdAt).toISOString(),
      status: cert.status,
      certificateId: cert.id,
    });
  } catch {
    res.status(500).json({ error: 'Failed to verify certificate' });
  }
});

export const certificatesRouter = Router({ mergeParams: true });
certificatesRouter.use(authenticate);
certificatesRouter.use(requireHackathonAccess);

certificatesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const certs = await prisma.certificate.findMany({
      where: { hackathonId: req.params.hackathonId! },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(certs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

certificatesRouter.post('/generate', requireAdmin, async (req: AuthRequest, res) => {
  const { teamIds, type = 'PARTICIPATION' } = req.body;
  const hackathonId = req.params.hackathonId!;

  try {
    const result = await generateCertificates(hackathonId, type, teamIds);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to generate certificates' });
  }
});
