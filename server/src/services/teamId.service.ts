import { prisma } from '../lib/prisma';

export async function generateTeamId(hackathonId: string): Promise<string> {
  const hackathon = await prisma.hackathon.findUnique({
    where: { id: hackathonId },
    select: { slug: true, name: true },
  });

  if (!hackathon) throw new Error('Hackathon not found');

  const code = (hackathon.slug || hackathon.name)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();

  const lastTeam = await prisma.team.findFirst({
    where: { hackathonId, teamId: { startsWith: `NEX-${code}-` } },
    orderBy: { teamId: 'desc' },
    select: { teamId: true },
  });

  let nextNum = 1;
  if (lastTeam?.teamId) {
    const parts = lastTeam.teamId.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  const teamId = `NEX-${code}-${String(nextNum).padStart(3, '0')}`;

  const existing = await prisma.team.findUnique({ where: { teamId } });
  if (existing) {
    return generateTeamId(hackathonId);
  }

  return teamId;
}

export async function generateQrToken(): Promise<string> {
  const { randomUUID, randomBytes } = await import('crypto');
  const token = `qr-${randomBytes(16).toString('hex')}`;

  const existing = await prisma.team.findUnique({ where: { qrToken: token } });
  if (existing) return generateQrToken();

  return token;
}

export function generateRegistrationId(slug: string, sequence: number): string {
  const code = slug.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `REG-${code}-${String(sequence).padStart(4, '0')}`;
}
