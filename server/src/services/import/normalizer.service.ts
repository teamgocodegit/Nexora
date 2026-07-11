export interface NormalizedRecord {
  teamName: string;
  leaderName: string;
  leaderEmail: string;
  leaderPhone: string;
  college: string;
  city: string;
  members: Array<{ name: string; email: string; phone: string }>;
  [key: string]: unknown;
}

export interface NormalizationResult {
  records: NormalizedRecord[];
  skippedRows: number[];
  errors: Array<{ row: number; message: string }>;
}

export function normalizeTeamPerRow(records: Record<string, string>[]): NormalizationResult {
  const normalized: NormalizedRecord[] = [];
  const skippedRows: number[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  records.forEach((record, idx) => {
    const row = idx + 1;

    const teamName = String(record.teamName || '').trim();
    const leaderName = String(record.leaderName || '').trim();
    const leaderEmail = String(record.leaderEmail || '').trim().toLowerCase();
    const leaderPhone = normalizePhone(String(record.leaderPhone || ''));
    const college = String(record.college || '').trim();
    const city = String(record.city || '').trim();

    if (!teamName && !leaderName) {
      skippedRows.push(idx);
      return;
    }

    if (!teamName) {
      errors.push({ row, message: 'Team name missing' });
      return;
    }

    if (!leaderName) {
      errors.push({ row, message: 'Leader name missing for team: ' + teamName });
      return;
    }

    if (!leaderEmail) {
      errors.push({ row, message: 'Leader email missing for team: ' + teamName });
      return;
    }

    const members: Array<{ name: string; email: string; phone: string }> = [];
    for (let i = 2; i <= 5; i++) {
      const name = String(record[`member${i}Name`] || '').trim();
      const email = String(record[`member${i}Email`] || '').trim().toLowerCase();
      const phone = normalizePhone(String(record[`member${i}Phone`] || ''));
      if (name) {
        members.push({ name, email, phone });
      }
    }

    normalized.push({
      teamName,
      leaderName,
      leaderEmail,
      leaderPhone,
      college,
      city,
      members,
    });
  });

  return { records: normalized, skippedRows, errors };
}

export function normalizeParticipantPerRow(records: Record<string, string>[]): NormalizationResult {
  const teamMap = new Map<string, NormalizedRecord>();
  const skippedRows: number[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  records.forEach((record, idx) => {
    const row = idx + 1;
    const teamName = String(record.teamName || '').trim();
    const name = String(record.memberName || record.leaderName || '').trim();
    const email = String(record.memberEmail || record.leaderEmail || '').trim().toLowerCase();
    const phone = normalizePhone(String(record.memberPhone || record.leaderPhone || ''));
    const college = String(record.college || '').trim();
    const city = String(record.city || '').trim();

    if (!teamName && !name) {
      skippedRows.push(idx);
      return;
    }

    if (!teamName) {
      errors.push({ row, message: 'Team name missing' });
      return;
    }

    if (!name) {
      errors.push({ row, message: 'Participant name missing for team: ' + teamName });
      return;
    }

    if (!teamMap.has(teamName)) {
      teamMap.set(teamName, {
        teamName,
        leaderName: '',
        leaderEmail: '',
        leaderPhone: '',
        college,
        city,
        members: [],
      });
    }

    const team = teamMap.get(teamName)!;
    if (team.members.length === 0) {
      team.leaderName = name;
      team.leaderEmail = email;
      team.leaderPhone = phone;
      team.members.push({ name, email, phone });
    } else {
      team.members.push({ name, email, phone });
    }
  });

  const records_out = Array.from(teamMap.values());

  if (records_out.length > 0 && !records_out[0].leaderEmail) {
    errors.push({ row: 1, message: 'First participant must have an email for team: ' + records_out[0].teamName });
  }

  return { records: records_out, skippedRows, errors };
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }
  return cleaned;
}

export function normalizeRecord(records: Record<string, string>[], layout: 'TEAM_PER_ROW' | 'PARTICIPANT_PER_ROW'): NormalizationResult {
  if (layout === 'TEAM_PER_ROW') {
    return normalizeTeamPerRow(records);
  }
  return normalizeParticipantPerRow(records);
}
