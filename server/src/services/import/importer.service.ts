import { prisma } from '../../lib/prisma';
import { generateTeamId, generateQrToken } from '../teamId.service';
import { io } from '../../index';
import { emitToHackathon } from '../../lib/socket';
import type { NormalizedRecord } from './normalizer.service';
import type { TeamValidation } from './validator.service';
import { logger } from '../../lib/logger';

export interface ImportResult {
  importedTeams: number;
  importedParticipants: number;
  warnings: number;
  errors: number;
  skipped: number;
  teamIds: string[];
  failedTeamNames: string[];
  success: boolean;
}

export async function executeImport(
  hackathonId: string,
  actorId: string,
  batchId: string,
  validTeams: TeamValidation[]
): Promise<ImportResult> {
  let importedTeams = 0;
  let importedParticipants = 0;
  const teamIds: string[] = [];
  const failedTeamNames: string[] = [];

  for (const validation of validTeams) {
    if (validation.status === 'ERROR') {
      continue;
    }

    try {
      const teamId = await generateTeamId(hackathonId);
      const qrToken = await generateQrToken();

      const allParticipants = [
        {
          name: validation.record.leaderName,
          email: validation.record.leaderEmail || null,
          phone: validation.record.leaderPhone || null,
          isLeader: true,
        },
        ...validation.record.members.map((m) => ({
          name: m.name,
          email: m.email || null,
          phone: m.phone || null,
          isLeader: false,
        })),
      ];

      await prisma.team.create({
        data: {
          hackathonId,
          name: validation.record.teamName,
          teamId,
          qrToken,
          participants: {
            create: allParticipants,
          },
        },
      });

      teamIds.push(teamId);
      importedTeams++;
      importedParticipants += allParticipants.length;

      await prisma.activityLog.create({
        data: {
          action: `Team "${validation.record.teamName}" imported via Registration Data Hub`,
          hackathonId,
          actorId,
          metadata: { batchId, teamId, participants: allParticipants.length },
        },
      }).catch((e) => logger.error(`[ActivityLog] ${e}`));
    } catch (err: any) {
      failedTeamNames.push(validation.record.teamName);
      logger.error(`[Import] Failed to create team "${validation.record.teamName}": ${err.message}`);
    }
  }

  const success = failedTeamNames.length === 0;

  return { importedTeams, importedParticipants, warnings: 0, errors: failedTeamNames.length, skipped: 0, teamIds, failedTeamNames, success };
}

export async function finalizeImport(
  batchId: string,
  result: ImportResult,
  totalRows: number,
  validRows: number,
  warningRows: number,
  errorRows: number
): Promise<void> {
  const status = result.success ? 'COMPLETED' : result.failedTeamNames.length > 0 && result.importedTeams > 0 ? 'PARTIAL' : 'FAILED';

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status,
      completedAt: new Date(),
      importedTeams: result.importedTeams,
      importedParticipants: result.importedParticipants,
      totalRows,
      validRows,
      warningRows,
      errorRows,
      failureReason: !result.success && result.importedTeams === 0 ? 'All teams failed to import' : null,
      importSummary: {
        teamIds: result.teamIds,
        failedTeamNames: result.failedTeamNames,
        importedTeams: result.importedTeams,
        importedParticipants: result.importedParticipants,
      },
    },
  });
}
