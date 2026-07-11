export interface ColumnMapping {
  sourceHeader: string;
  targetField: string;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

export interface FieldDefinition {
  field: string;
  label: string;
  required: boolean;
  type: 'string' | 'email' | 'phone' | 'url';
  aliases: string[];
}

export type LayoutType = 'TEAM_PER_ROW' | 'PARTICIPANT_PER_ROW';

const CORE_FIELDS: FieldDefinition[] = [
  { field: 'teamName', label: 'Team Name', required: true, type: 'string', aliases: ['team', 'team name', 'group', 'group name', 'squad', 'squad name', 'team_name', 'teamname', 'project name', 'project'] },
  { field: 'leaderName', label: 'Team Leader Name', required: true, type: 'string', aliases: ['leader', 'leader name', 'team leader', 'captain', 'captain name', 'primary contact', 'representative', 'team_leader', 'leadername', 'lead name', 'name of leader', 'tl', 'team lead', 'head'] },
  { field: 'leaderEmail', label: 'Team Leader Email', required: true, type: 'email', aliases: ['email', 'email address', 'mail', 'mail id', 'e-mail', 'emailid', 'email_id', 'leader email', 'leader email address', 'leader_email', 'captain email', 'captain mail', 'email of leader', 'mail address'] },
  { field: 'leaderPhone', label: 'Team Leader Phone', required: false, type: 'phone', aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'leader phone', 'leader phone number', 'leader_phone', 'phone_no', 'mobileno', 'whatsapp', 'tel', 'telephone'] },
  { field: 'college', label: 'College / Institution', required: false, type: 'string', aliases: ['college', 'institution', 'university', 'organization', 'organisation', 'school', 'inst', 'college name', 'institute', 'collegename'] },
  { field: 'city', label: 'City', required: false, type: 'string', aliases: ['city', 'town', 'location', 'place', 'district'] },
  { field: 'memberName', label: 'Member Name', required: false, type: 'string', aliases: ['member', 'member name', 'participant', 'participant name', 'team member', 'teammate', 'name'] },
  { field: 'memberEmail', label: 'Member Email', required: false, type: 'email', aliases: ['member email', 'participant email', 'member_email', 'participant email address'] },
  { field: 'memberPhone', label: 'Member Phone', required: false, type: 'phone', aliases: ['member phone', 'participant phone', 'member_phone', 'participant phone number'] },
];

export const LAYOUT_A_FIELDS: FieldDefinition[] = [
  ...CORE_FIELDS,
  { field: 'member2Name', label: 'Member 2 Name', required: false, type: 'string', aliases: ['member 2 name', 'member2 name', 'member_2_name', 'teammate 2', 'participant 2 name'] },
  { field: 'member2Email', label: 'Member 2 Email', required: false, type: 'email', aliases: ['member 2 email', 'member2 email', 'member_2_email', 'participant 2 email'] },
  { field: 'member3Name', label: 'Member 3 Name', required: false, type: 'string', aliases: ['member 3 name', 'member3 name', 'member_3_name', 'teammate 3', 'participant 3 name'] },
  { field: 'member3Email', label: 'Member 3 Email', required: false, type: 'email', aliases: ['member 3 email', 'member3 email', 'member_3_email', 'participant 3 email'] },
  { field: 'member4Name', label: 'Member 4 Name', required: false, type: 'string', aliases: ['member 4 name', 'member4 name', 'member_4_name', 'teammate 4', 'participant 4 name'] },
  { field: 'member4Email', label: 'Member 4 Email', required: false, type: 'email', aliases: ['member 4 email', 'member4 email', 'member_4_email', 'participant 4 email'] },
  { field: 'member5Name', label: 'Member 5 Name', required: false, type: 'string', aliases: ['member 5 name', 'member5 name', 'member_5_name', 'teammate 5', 'participant 5 name'] },
  { field: 'member5Email', label: 'Member 5 Email', required: false, type: 'email', aliases: ['member 5 email', 'member5 email', 'member_5_email', 'participant 5 email'] },
];

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(header: string): Set<string> {
  return new Set(
    normalizeHeader(header)
      .split(' ')
      .filter((t) => t.length > 1 && !['the', 'for', 'and', 'of', 'in', 'to', 'a'].includes(t))
  );
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count++;
  }
  return count;
}

export function getFieldDefinitions(layout: LayoutType = 'TEAM_PER_ROW'): FieldDefinition[] {
  return layout === 'TEAM_PER_ROW' ? LAYOUT_A_FIELDS : CORE_FIELDS;
}

export function suggestMapping(headers: string[], layout: LayoutType = 'TEAM_PER_ROW'): ColumnMapping[] {
  const fields = getFieldDefinitions(layout);
  const usedFields = new Set<string>();

  const mappings: ColumnMapping[] = headers.map((header) => {
    const normalized = normalizeHeader(header);
    if (!normalized) {
      return {
        sourceHeader: header,
        targetField: '',
        confidence: 0,
        confidenceLabel: 'LOW',
        reason: 'Empty header',
      };
    }

    const headerTokens = tokenize(normalized);

    let bestMatch: FieldDefinition | null = null;
    let bestScore = 0;
    let bestReason = '';

    for (const field of fields) {
      if (usedFields.has(field.field)) continue;

      // Exact alias match
      for (const alias of field.aliases) {
        const normalizedAlias = normalizeHeader(alias);
        if (normalized === normalizedAlias) {
          bestScore = 100;
          bestMatch = field;
          bestReason = `Exact match: "${header}" matches "${alias}"`;
          break;
        }
      }
      if (bestScore === 100) break;

      // Partial/token match
      const aliasTokens = new Set<string>();
      for (const alias of field.aliases) {
        const tokens = tokenize(alias);
        for (const t of tokens) aliasTokens.add(t);
      }

      const intersection = intersectionSize(headerTokens, aliasTokens);
      if (intersection > 0) {
        const score = Math.round((intersection / Math.max(headerTokens.size, 1)) * 100);
        if (score > bestScore) {
          bestScore = Math.min(score, 95);
          bestMatch = field;
          const matchedTokens = [...headerTokens].filter((t) => aliasTokens.has(t));
          bestReason = `Token match: "${matchedTokens.join(', ')}" in "${header}"`;
        }
      }

      // Contains check
      for (const alias of field.aliases) {
        const normalizedAlias = normalizeHeader(alias);
        if (normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias)) {
          const score = Math.round(
            (Math.max(normalized.length, normalizedAlias.length) /
              Math.min(normalized.length, normalizedAlias.length) || 1) * 30
          );
          if (score > bestScore) {
            bestScore = Math.min(score, 80);
            bestMatch = field;
            bestReason = `Contains match: "${header}" ↔ "${alias}"`;
          }
        }
      }
    }

    if (bestMatch && bestScore >= 70) {
      usedFields.add(bestMatch.field);
    }

    let confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    if (bestScore >= 80) confidenceLabel = 'HIGH';
    else if (bestScore >= 50) confidenceLabel = 'MEDIUM';
    else confidenceLabel = 'LOW';

    if (bestMatch && bestScore < 50) {
      bestMatch = null;
      bestScore = 0;
    }

    return {
      sourceHeader: header,
      targetField: bestMatch?.field || '',
      confidence: bestScore,
      confidenceLabel,
      reason: bestReason || 'No match found',
    };
  });

  return mappings;
}

export function detectLayout(headers: string[]): { layout: LayoutType; confidence: number } {
  const normalized = headers.map(normalizeHeader);
  const teamPatterns = ['member 2', 'member2', 'member3', 'member 3'];
  const teamCount = teamPatterns.filter((p) => normalized.some((h) => h.includes(p))).length;
  if (teamCount >= 2) {
    return { layout: 'TEAM_PER_ROW', confidence: 90 };
  }
  return { layout: 'PARTICIPANT_PER_ROW', confidence: 70 };
}

export function applyMapping(rows: string[][], headers: string[], mappings: ColumnMapping[], layout: LayoutType): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    mappings.forEach((mapping, idx) => {
      if (mapping.targetField && idx < row.length) {
        record[mapping.targetField] = row[idx] ?? '';
      }
    });
    return record;
  });
}
