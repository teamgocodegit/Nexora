import { prisma } from '../../lib/prisma';
import archiver from 'archiver';
import crypto from 'crypto';
import { Readable } from 'stream';

export interface CsvRow {
  [key: string]: string | number | boolean | null;
}

function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const vals = headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export async function exportTeamsCsv(hackathonId: string): Promise<string> {
  const teams = await prisma.team.findMany({
    where: { hackathonId, deletedAt: null },
    include: {
      _count: { select: { participants: true } },
      coordinator: { include: { user: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  const rows: CsvRow[] = teams.map(t => ({
    Team_ID: t.teamId || '',
    Name: t.name,
    Status: t.status,
    Room: t.room || '',
    Table: t.tableNumber || '',
    Project: t.projectName || '',
    'Member Count': t._count.participants,
    'Check-in Time': t.checkInTime?.toISOString() || '',
    'Checked In By': t.checkInBy || '',
    Coordinator: t.coordinator?.user?.name || '',
  }));

  return toCsv(rows);
}

export async function exportParticipantsCsv(hackathonId: string): Promise<string> {
  const participants = await prisma.participant.findMany({
    where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
    include: { team: { select: { id: true, teamId: true, name: true } } },
    orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
  });

  const rows: CsvRow[] = participants.map(p => ({
    Name: p.name,
    Email: p.email || '',
    Phone: p.phone || '',
    'Is Leader': p.isLeader ? 'Yes' : 'No',
    'Team Name': p.team.name,
    'Team ID': p.team.teamId || '',
  }));

  return toCsv(rows);
}

export async function exportCheckinCsv(hackathonId: string): Promise<string> {
  const teams = await prisma.team.findMany({
    where: { hackathonId, deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const rows: CsvRow[] = teams.map(t => ({
    'Team ID': t.teamId || '',
    Name: t.name,
    Status: t.status,
    'Checked In': t.status === 'CHECKED_IN' ? 'Yes' : 'No',
    'Check-in Time': t.checkInTime?.toISOString() || '',
    'Check-in By': t.checkInBy || '',
    Participants: '',
  }));

  return toCsv(rows);
}

export async function exportRoomsCsv(hackathonId: string): Promise<string> {
  const rooms = await prisma.room.findMany({
    where: { hackathonId, deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const roomNames = rooms.map(r => r.name);
  const teamCounts = roomNames.length > 0
    ? await prisma.team.groupBy({
      by: ['room'],
      where: { hackathonId, room: { in: roomNames }, deletedAt: null },
      _count: true,
    })
    : [];

  const countMap = new Map(teamCounts.map(tc => [tc.room, tc._count]));

  const rows: CsvRow[] = rooms.map(r => ({
    Name: r.name,
    Building: r.building || '',
    Floor: r.floor || '',
    Capacity: r.capacity,
    Status: r.status,
    'Teams Assigned': countMap.get(r.name) || 0,
  }));

  return toCsv(rows);
}

export async function exportScoresCsv(hackathonId: string): Promise<string> {
  const [teams, criteria] = await Promise.all([
    prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.scoringCriteria.findMany({
      where: { hackathonId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const scores = await prisma.score.findMany({
    where: { team: { hackathonId } },
    include: {
      criteria: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  const scoreByTeamCrit = new Map<string, number>();
  for (const s of scores) {
    scoreByTeamCrit.set(`${s.teamId}:${s.criteriaId}`, s.value);
  }

  const headers = ['Team ID', 'Team Name', ...criteria.map(c => c.name), 'Total'];
  const lines = [headers.join(',')];

  for (const team of teams) {
    let total = 0;
    const vals = [team.teamId || '', team.name];
    for (const c of criteria) {
      const v = scoreByTeamCrit.get(`${team.id}:${c.id}`);
      vals.push(v !== undefined ? String(v) : '');
      if (v !== undefined) total += v;
    }
    vals.push(String(total));
    lines.push(vals.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  }

  return lines.join('\n');
}

export async function generateEmergencyPack(hackathonId: string) {
  const [teams, participants, rooms, hackathon] = await Promise.all([
    prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      include: { _count: { select: { participants: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.participant.findMany({
      where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
      include: { team: { select: { id: true, teamId: true, name: true } } },
      orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.room.findMany({
      where: { hackathonId, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
  ]);

  const roomNames = rooms.map(r => r.name);
  const teamCounts = roomNames.length > 0
    ? await prisma.team.groupBy({
      by: ['room'],
      where: { hackathonId, room: { in: roomNames }, deletedAt: null },
      _count: true,
    })
    : [];

  const countMap = new Map(teamCounts.map(tc => [tc.room, tc._count]));

  return {
    exportedAt: new Date().toISOString(),
    hackathon: hackathon ? {
      id: hackathon.id,
      name: hackathon.name,
      venue: hackathon.venue,
      startDate: hackathon.startDate,
      endDate: hackathon.endDate,
      status: hackathon.status,
    } : null,
    teams: {
      count: teams.length,
      checkedIn: teams.filter(t => t.status === 'CHECKED_IN').length,
      data: teams.map(t => ({
        id: t.teamId || t.id,
        name: t.name,
        status: t.status,
        room: t.room,
        participants: t._count.participants,
      })),
    },
    participants: {
      count: participants.length,
      data: participants.map(p => ({
        name: p.name,
        email: p.email,
        phone: p.phone,
        isLeader: p.isLeader,
        team: p.team.name,
        teamId: p.team.teamId || p.team.id,
      })),
    },
    rooms: {
      count: rooms.length,
      data: rooms.map(r => ({
        name: r.name,
        building: r.building,
        floor: r.floor,
        capacity: r.capacity,
        teamsAssigned: countMap.get(r.name) || 0,
      })),
    },
  };
}

export async function generateEmergencyPackZip(hackathonId: string, hackathonName: string): Promise<{ stream: Readable; filename: string }> {
  const archive = archiver('zip', { zlib: { level: 9 } });

  const snapshotJson = await generateEmergencyPack(hackathonId);
  const teamsCsv = await exportTeamsCsv(hackathonId);
  const participantsCsv = await exportParticipantsCsv(hackathonId);
  const checkinCsv = await exportCheckinCsv(hackathonId);
  const roomsCsv = await exportRoomsCsv(hackathonId);
  const scoresCsv = await exportScoresCsv(hackathonId);

  const checksums: Record<string, string> = {};

  const addFile = (name: string, content: string) => {
    archive.append(content, { name });
    checksums[name] = crypto.createHash('sha256').update(content).digest('hex');
  };

  addFile('README.txt', `NEXORA EMERGENCY PACK
Generated: ${new Date().toISOString()}
Hackathon: ${hackathonName}
Format Version: 2

This package contains operational data for offline use.
All files use SHA-256 checksums in manifest.json for integrity verification.

Files:
- teams.csv        : Team master list with IDs, status, room assignments
- participants.csv : All participants with names, emails, team info
- checkin.csv      : Check-in status for all teams
- rooms.csv        : Room allocations with capacity and occupancy
- scores.csv       : Judging scores by criteria
- snapshot.json    : Complete machine-readable operational snapshot
- manifest.json    : File list with checksums and metadata
`);

  addFile('teams.csv', teamsCsv);
  addFile('participants.csv', participantsCsv);
  addFile('checkin.csv', checkinCsv);
  addFile('rooms.csv', roomsCsv);
  addFile('scores.csv', scoresCsv);
  addFile('snapshot.json', JSON.stringify(snapshotJson, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(),
    hackathonId,
    hackathonName,
    formatVersion: 2,
    files: checksums,
    totalFiles: Object.keys(checksums).length,
  };

  addFile('manifest.json', JSON.stringify(manifest, null, 2));

  archive.finalize();

  const safeName = hackathonName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    stream: archive,
    filename: `Nexora-Emergency-Pack-${safeName}.zip`,
  };
}
