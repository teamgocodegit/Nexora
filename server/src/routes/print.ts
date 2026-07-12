import { Router, Request, Response } from 'express';
import { authenticate, requireHackathonAccess } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/permissions';
import { logActivity } from '../services/reliability/activityLog.service';
import { logger } from '../lib/logger';

import {
  generateTeamMasterListPdf,
  generateParticipantMasterListPdf,
  generateRoomAllocationPdf,
  generateCheckInSheetPdf,
  generateRoomDoorSheetPdf,
  generateTeamDeskCardsPdf,
  generateParticipantBadgesPdf,
  generateBlankJudgingSheetsPdf,
  generateTeamMasterListCsv,
  generateParticipantMasterListCsv,
  generateRoomAllocationCsv,
  generateCheckInStatusCsv,
  generateTeamMasterListXlsx,
  generateParticipantMasterListXlsx,
} from '../services/print/printCenter.service';

export const printRouter = Router({ mergeParams: true });
printRouter.use(authenticate);
printRouter.use(requireHackathonAccess);
printRouter.use(requireSuperAdmin);

const SAFE_NAME_RE = /[^a-zA-Z0-9_-]/g;

const DOC_NAMES: Record<string, string> = {
  'team-master': 'Team-Master-List',
  'participant-master': 'Participant-Master-List',
  'room-allocation': 'Room-Allocation',
  'checkin-sheet': 'Check-In-Sheet',
  'room-door': 'Room-Door-Sheet',
  'desk-cards': 'Team-Desk-Cards',
  'badges': 'Participant-Badges',
  'judging-sheets': 'Blank-Judging-Sheets',
};

const PDF_GENERATORS: Record<string, (hackathonId: string, hackathonName: string, query: any) => Promise<Buffer>> = {
  'team-master': async (hackathonId, _, query) => {
    const filters: any = {};
    if (query.checkedIn === 'true') filters.checkedIn = true;
    if (query.unassigned === 'true') filters.unassigned = true;
    if (query.roomId) filters.roomId = query.roomId;
    return generateTeamMasterListPdf(hackathonId, filters);
  },
  'participant-master': async (hackathonId) => generateParticipantMasterListPdf(hackathonId),
  'room-allocation': async (hackathonId) => generateRoomAllocationPdf(hackathonId),
  'checkin-sheet': async (hackathonId) => generateCheckInSheetPdf(hackathonId),
  'room-door': async (hackathonId, _, query) => generateRoomDoorSheetPdf(hackathonId, query.roomId || undefined),
  'desk-cards': async (hackathonId) => generateTeamDeskCardsPdf(hackathonId),
  'badges': async (hackathonId) => generateParticipantBadgesPdf(hackathonId),
  'judging-sheets': async (hackathonId) => generateBlankJudgingSheetsPdf(hackathonId),
};

printRouter.get('/:docType/pdf', async (req: Request, res: Response) => {
  try {
    const { docType } = req.params;
    const gen = PDF_GENERATORS[docType];
    if (!gen) return res.status(400).json({ error: `Unknown document type: ${docType}. Available: ${Object.keys(PDF_GENERATORS).join(', ')}` });

    const hackathon = await (await import('../lib/prisma')).prisma.hackathon.findUnique({ where: { id: req.params.hackathonId! } });
    const safeName = (hackathon?.name || 'hackathon').replace(SAFE_NAME_RE, '_');
    const docName = DOC_NAMES[docType] || docType;

    const pdf = await gen(req.params.hackathonId!, hackathon?.name || 'Hackathon', req.query);

    await logActivity({
      action: `Printed ${docName}`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'Print',
      metadata: { docType, format: 'pdf' },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Nexora-${docName}-${safeName}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const CSV_GENERATORS: Record<string, (hackathonId: string) => Promise<string>> = {
  'team-master': generateTeamMasterListCsv,
  'participant-master': generateParticipantMasterListCsv,
  'room-allocation': generateRoomAllocationCsv,
  'checkin-sheet': generateCheckInStatusCsv,
};

printRouter.get('/:docType/csv', async (req: Request, res: Response) => {
  try {
    const { docType } = req.params;
    const gen = CSV_GENERATORS[docType];
    if (!gen) return res.status(400).json({ error: `CSV not available for ${docType}. Available: ${Object.keys(CSV_GENERATORS).join(', ')}` });

    const csv = await gen(req.params.hackathonId!);
    const hackathon = await (await import('../lib/prisma')).prisma.hackathon.findUnique({ where: { id: req.params.hackathonId! } });
    const safeName = (hackathon?.name || 'hackathon').replace(SAFE_NAME_RE, '_');
    const docName = DOC_NAMES[docType] || docType;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Nexora-${docName}-${safeName}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const XLSX_GENERATORS: Record<string, (hackathonId: string) => Promise<Buffer>> = {
  'team-master': generateTeamMasterListXlsx,
  'participant-master': generateParticipantMasterListXlsx,
};

printRouter.get('/:docType/xlsx', async (req: Request, res: Response) => {
  try {
    const { docType } = req.params;
    const gen = XLSX_GENERATORS[docType];
    if (!gen) return res.status(400).json({ error: `XLSX not available for ${docType}. Available: ${Object.keys(XLSX_GENERATORS).join(', ')}` });

    const buf = await gen(req.params.hackathonId!);
    const hackathon = await (await import('../lib/prisma')).prisma.hackathon.findUnique({ where: { id: req.params.hackathonId! } });
    const safeName = (hackathon?.name || 'hackathon').replace(SAFE_NAME_RE, '_');
    const docName = DOC_NAMES[docType] || docType;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Nexora-${docName}-${safeName}.xlsx"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
