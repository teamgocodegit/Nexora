import { prisma } from '../../lib/prisma';

export type IssueSeverity = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface IntegrityIssue {
  type: string;
  severity: IssueSeverity;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  explanation: string;
  suggestedAction: string;
}

export interface IntegrityReport {
  overall: IssueSeverity;
  issues: IntegrityIssue[];
  healthy: boolean;
}

export async function checkIntegrity(hackathonId: string): Promise<IntegrityReport> {
  const issues: IntegrityIssue[] = [];

  const addIssue = (severity: IssueSeverity, type: string, entityType: string, entityId: string | null, entityName: string | null, explanation: string, suggestedAction: string) => {
    issues.push({ type, severity, entityType, entityId, entityName, explanation, suggestedAction });
  };

  const hackathon = await prisma.hackathon.findUnique({ where: { id: hackathonId } });
  if (!hackathon) {
    return { overall: 'CRITICAL', issues: [{ type: 'HACKATHON_NOT_FOUND', severity: 'CRITICAL', entityType: 'Hackathon', entityId: hackathonId, entityName: null, explanation: 'Hackathon does not exist', suggestedAction: 'Verify hackathon ID' }], healthy: false };
  }

  const [teams, participants, rooms, registrations, scores, certificates, importBatches, emailCampaigns] = await Promise.all([
    prisma.team.findMany({ where: { hackathonId, deletedAt: null }, include: { _count: { select: { participants: true } } } }),
    prisma.participant.findMany({ where: { team: { hackathonId }, deletedAt: null }, include: { team: { select: { id: true, name: true } } } }),
    prisma.room.findMany({ where: { hackathonId, deletedAt: null } }),
    prisma.registration.findMany({ where: { hackathonId } }),
    prisma.score.findMany({ where: { team: { hackathonId } }, include: { team: { select: { id: true, name: true } }, criteria: { select: { id: true, name: true, maxScore: true } } } }),
    prisma.certificate.findMany({ where: { hackathonId } }),
    prisma.importBatch.findMany({ where: { hackathonId }, orderBy: { createdAt: 'desc' } }),
    prisma.emailCampaign.findMany({ where: { hackathonId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const roomNames = new Set(rooms.map(r => r.name));
  const teamIds = new Set(teams.map(t => t.id));
  const teamIdValues = new Map<string, string[]>();
  const qrTokens = new Map<string, string[]>();

  for (const team of teams) {
    if (team.teamId) {
      const existing = teamIdValues.get(team.teamId) || [];
      existing.push(team.id);
      teamIdValues.set(team.teamId, existing);
    }
    if (team.qrToken) {
      const existing = qrTokens.get(team.qrToken) || [];
      existing.push(team.id);
      qrTokens.set(team.qrToken, existing);
    }
  }

  importBatches.forEach(b => {
    const stuckDuration = Date.now() - b.createdAt.getTime();
    if (b.status === 'IMPORTING' && stuckDuration > 3600000) {
      addIssue('WARNING', 'STUCK_IMPORT', 'ImportBatch', b.id, b.originalFileName, `Import "${b.originalFileName}" stuck in IMPORTING for ${Math.round(stuckDuration / 60000)} minutes`, 'Verify import worker is running. If stuck, cancel and re-import.');
    }
  });

  emailCampaigns.forEach(c => {
    if (c.status === 'PROCESSING') {
      const stuckDuration = c.startedAt ? Date.now() - c.startedAt.getTime() : Date.now() - c.createdAt.getTime();
      if (stuckDuration > 600000) {
        addIssue('WARNING', 'STUCK_CAMPAIGN', 'EmailCampaign', c.id, c.name, `Email campaign "${c.name}" stuck in PROCESSING for ${Math.round(stuckDuration / 60000)} minutes`, 'Verify email worker is running. Consider cancelling and retrying.');
      }
    }
  });

  teams.forEach(team => {
    if (team.room && !roomNames.has(team.room)) {
      addIssue('WARNING', 'ORPHANED_ROOM_ASSIGNMENT', 'Team', team.id, team.name, `Team "${team.name}" assigned to room "${team.room}" which does not exist`, 'Reassign team to a valid room or clear the room field.');
    }
  });

  teamIdValues.forEach((ids, value) => {
    if (ids.length > 1) {
      ids.forEach(id => {
        const t = teams.find(x => x.id === id);
        addIssue('CRITICAL', 'DUPLICATE_TEAM_ID', 'Team', id, t?.name || null, `Duplicate human-readable Team ID "${value}" used by ${ids.length} teams`, 'Reassign unique Team IDs to each team.');
      });
    }
  });

  qrTokens.forEach((ids, value) => {
    if (ids.length > 1) {
      ids.forEach(id => {
        const t = teams.find(x => x.id === id);
        addIssue('CRITICAL', 'DUPLICATE_QR_TOKEN', 'Team', id, t?.name || null, `Duplicate QR token "${value}" used by ${ids.length} teams`, 'Regenerate QR tokens for affected teams.');
      });
    }
  });

  certificates.forEach(cert => {
    if (!teamIds.has(cert.teamId)) {
      addIssue('WARNING', 'ORPHANED_CERTIFICATE', 'Certificate', cert.id, cert.participantName, `Certificate for "${cert.participantName}" references team that no longer exists`, 'Remove or reassign the certificate.');
    }
  });

  if (hackathon.maxTeams && teams.length > hackathon.maxTeams) {
    addIssue('WARNING', 'MAX_TEAMS_EXCEEDED', 'Hackathon', hackathonId, hackathon.name, `Team count (${teams.length}) exceeds max teams (${hackathon.maxTeams})`, 'Increase max teams or reduce active teams.');
  }

  teams.forEach(team => {
    const teamSize = team._count.participants;
    const minSize = hackathon.minTeamSize;
    const maxSize = hackathon.maxTeamSize;
    if (teamSize < minSize) {
      addIssue('WARNING', 'UNDERSIZED_TEAM', 'Team', team.id, team.name, `Team "${team.name}" has ${teamSize} members (min ${minSize})`, 'Add more members or merge with another team.');
    }
    if (maxSize && teamSize > maxSize) {
      addIssue('WARNING', 'OVERSIZED_TEAM', 'Team', team.id, team.name, `Team "${team.name}" has ${teamSize} members (max ${maxSize})`, 'Remove excess members.');
    }
  });

  scores.forEach(score => {
    if (score.value > score.criteria.maxScore) {
      addIssue('WARNING', 'SCORE_EXCEEDS_MAX', 'Score', score.id, null, `Score ${score.value} exceeds max (${score.criteria.maxScore}) for criteria "${score.criteria.name}"`, 'Review and correct the score.');
    }
  });

  const overall: IssueSeverity = issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' : issues.some(i => i.severity === 'WARNING') ? 'WARNING' : 'HEALTHY';

  return {
    overall,
    issues,
    healthy: issues.length === 0,
    summary: {
      totalTeams: teams.length,
      totalParticipants: participants.length,
      totalRooms: rooms.length,
      totalScores: scores.length,
      totalRegistrations: registrations.length,
      totalCertificates: certificates.length,
    },
  };
}
