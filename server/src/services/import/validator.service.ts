import { prisma } from '../../lib/prisma';
import type { NormalizedRecord } from './normalizer.service';

export interface ValidationResult {
  teams: TeamValidation[];
  totalValid: number;
  totalWarnings: number;
  totalErrors: number;
  duplicateEmails: string[];
  duplicateTeams: string[];
  existingTeamConflicts: string[];
}

export interface TeamValidation {
  index: number;
  teamName: string;
  status: 'VALID' | 'WARNING' | 'ERROR';
  errors: string[];
  warnings: string[];
  record: NormalizedRecord;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateTeams(
  records: NormalizedRecord[],
  hackathonId: string,
  maxTeamSize: number,
  existingTeamNames: string[],
  existingEmails: string[]
): Promise<ValidationResult> {
  const results: TeamValidation[] = [];
  const seenEmails = new Set<string>();
  const seenTeamNames = new Set<string>();
  const allDuplicateEmails: string[] = [];
  const allDuplicateTeams: string[] = [];

  const dbTeams = await prisma.team.findMany({
    where: { hackathonId, deletedAt: null },
    select: { name: true, participants: { select: { email: true } } },
  });
  const dbTeamNames = new Set(dbTeams.map((t) => t.name.toLowerCase()));
  const dbEmails = new Set(
    dbTeams.flatMap((t) => t.participants.map((p) => p.email?.toLowerCase()).filter(Boolean))
  );

  for (const existingName of existingTeamNames) {
    dbTeamNames.add(existingName.toLowerCase());
  }
  for (const existingEmail of existingEmails) {
    dbEmails.add(existingEmail.toLowerCase());
  }

  let totalValid = 0;
  let totalWarnings = 0;
  let totalErrors = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const teamKey = record.teamName.toLowerCase();

    if (!record.teamName) {
      errors.push('Team name is missing');
    }

    if (!record.leaderName) {
      errors.push('Team leader name is missing');
    }

    if (!record.leaderEmail) {
      errors.push('Team leader email is missing');
    } else if (!EMAIL_REGEX.test(record.leaderEmail)) {
      errors.push(`Invalid leader email format: "${record.leaderEmail}"`);
    }

    if (record.leaderEmail) {
      if (seenEmails.has(record.leaderEmail.toLowerCase())) {
        errors.push(`Duplicate leader email within file: "${record.leaderEmail}"`);
        allDuplicateEmails.push(record.leaderEmail);
      }
      seenEmails.add(record.leaderEmail.toLowerCase());

      if (dbEmails.has(record.leaderEmail.toLowerCase())) {
        warnings.push(`Email "${record.leaderEmail}" already exists in the database`);
      }
    }

    if (seenTeamNames.has(teamKey)) {
      errors.push(`Duplicate team name within file: "${record.teamName}"`);
      allDuplicateTeams.push(record.teamName);
    }
    seenTeamNames.add(teamKey);

    if (dbTeamNames.has(teamKey)) {
      errors.push(`Team name "${record.teamName}" already exists in the database`);
    }

    const totalMembers = 1 + record.members.length;
    if (totalMembers > maxTeamSize) {
      errors.push(`Team has ${totalMembers} members, exceeds maximum of ${maxTeamSize}`);
    }

    for (const member of record.members) {
      if (!member.name) {
        errors.push('A member has no name');
      }
      if (member.email && !EMAIL_REGEX.test(member.email)) {
        errors.push(`Invalid member email format: "${member.email}"`);
      }
      if (member.email) {
        if (seenEmails.has(member.email.toLowerCase())) {
          warnings.push(`Duplicate email within file: "${member.email}"`);
        }
        seenEmails.add(member.email.toLowerCase());
        if (dbEmails.has(member.email.toLowerCase())) {
          warnings.push(`Email "${member.email}" already exists in the database`);
        }
      }
    }

    let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
    if (errors.length > 0) {
      status = 'ERROR';
      totalErrors++;
    } else if (warnings.length > 0) {
      status = 'WARNING';
      totalWarnings++;
    } else {
      totalValid++;
    }

    results.push({ index: i, teamName: record.teamName, status, errors, warnings, record });
  }

  return {
    teams: results,
    totalValid,
    totalWarnings,
    totalErrors,
    duplicateEmails: [...new Set(allDuplicateEmails)],
    duplicateTeams: [...new Set(allDuplicateTeams)],
    existingTeamConflicts: [...new Set(dbTeamNames)].length > 0 ? [...dbTeamNames] : [],
  };
}
