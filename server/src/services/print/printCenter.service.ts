import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import * as XLSX from 'xlsx';

function escapeCsv(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.length === 0) return '';
  const first = s[0];
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    return `'${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function wrapHtml(title: string, hackathonName: string, tables: string[], landscape = false): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; color: #1a1a2e; padding: 15mm 10mm; }
  h1 { font-size: 16px; margin-bottom: 2px; color: #0f3460; }
  h2 { font-size: 13px; margin: 14px 0 6px; color: #16213e; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .meta { font-size: 9px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9px; }
  th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; }
  th { background: #0f3460; color: #fff; font-weight: 600; }
  tr:nth-child(even) { background: #f5f5f5; }
  .page-break { page-break-before: always; }
  .door-sign { text-align: center; padding: 40px 20px; border: 3px solid #0f3460; border-radius: 8px; margin: 20px auto; max-width: 400px; }
  .door-sign h2 { font-size: 24px; border: none; margin: 10px 0; }
  .door-sign .teams { font-size: 12px; color: #555; margin-top: 8px; }
  .desk-card { display: inline-block; width: 45%; border: 1px solid #ccc; border-radius: 4px; padding: 8px; margin: 4px; font-size: 9px; vertical-align: top; }
  .desk-card .qr { text-align: center; margin: 6px 0; }
  .desk-card .team-name { font-size: 11px; font-weight: 700; }
  .badge { display: inline-block; width: 30%; border: 1px solid #ddd; border-radius: 4px; padding: 6px; margin: 3px; font-size: 8px; text-align: center; vertical-align: top; }
  .badge .name { font-size: 10px; font-weight: 600; }
  .checkbox-cell { width: 20px; height: 20px; border: 1px solid #999; display: inline-block; }
  @media print { body { padding: 0; } .page-break { page-break-before: always; } }
</style></head><body>
  <h1>${escapeHtml(hackathonName)}</h1>
  <div class="meta">${escapeHtml(title)} — Generated: ${new Date().toISOString().split('T')[0]}</div>
  ${tables.join('\n')}
</body></html>`;
}

let puppeteer: any = null;
async function getBrowser(): Promise<any> {
  if (!puppeteer) puppeteer = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function renderPdf(html: string, landscape = false): Promise<Buffer> {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape,
      printBackground: true,
      margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generateTeamMasterListPdf(hackathonId: string, filters?: { checkedIn?: boolean; unassigned?: boolean; roomId?: string }): Promise<Buffer> {
  const [hackathon, teams] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    getTeamListData(hackathonId, filters),
  ]);
  const rows = teams.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.teamId || '')}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.leader)}</td><td>${t.participantCount}</td><td>${escapeHtml(t.room || '-')}</td><td>${t.checkedIn ? 'CHECKED IN' : 'NOT CHECKED IN'}</td></tr>`).join('');
  const html = wrapHtml('Team Master List', hackathon?.name || 'Hackathon', [
    `<table><thead><tr><th>#</th><th>Team ID</th><th>Name</th><th>Leader</th><th>Members</th><th>Room</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`,
  ]);
  return renderPdf(html);
}

export async function generateParticipantMasterListPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, participants] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    prisma.participant.findMany({
      where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
      include: { team: { select: { teamId: true, name: true, status: true, room: true } } },
      orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
    }),
  ]);
  const rows = participants.map((p, i) => {
    const team = p.team;
    return `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(team.teamId || '')}</td><td>${escapeHtml(team.name)}</td><td>${escapeHtml(p.email || '')}</td><td>${escapeHtml(p.phone || '')}</td><td>${team.status === 'CHECKED_IN' ? 'CHECKED IN' : '—'}</td></tr>`;
  }).join('');
  const html = wrapHtml('Participant Master List', hackathon?.name || 'Hackathon', [
    `<table><thead><tr><th>#</th><th>Name</th><th>Team ID</th><th>Team</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`,
  ]);
  return renderPdf(html);
}

export async function generateRoomAllocationPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, rooms] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    prisma.room.findMany({
      where: { hackathonId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const tables: string[] = [];
  for (const room of rooms) {
    const teams = await prisma.team.findMany({
      where: { hackathonId, room: room.name, deletedAt: null },
      select: { teamId: true, name: true, status: true, _count: { select: { participants: true } } },
      orderBy: { name: 'asc' },
    });
    const rows = teams.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.teamId || '')}</td><td>${escapeHtml(t.name)}</td><td>${t._count.participants}</td><td>${t.status === 'CHECKED_IN' ? 'CHECKED IN' : '—'}</td></tr>`).join('');
    tables.push(`<h2>${escapeHtml(room.name)} (${teams.length}/${room.capacityTeams || '∞'} teams)</h2><table><thead><tr><th>#</th><th>Team ID</th><th>Name</th><th>Members</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No teams assigned</td></tr>'}</tbody></table>`);
  }

  const html = wrapHtml('Room Allocation Sheet', hackathon?.name || 'Hackathon', tables);
  return renderPdf(html);
}

export async function generateCheckInSheetPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, teams] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    getTeamListData(hackathonId),
  ]);
  const rows = teams.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.teamId || '')}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.leader)}</td><td>${t.participantCount}</td><td>${escapeHtml(t.room || '-')}</td><td>${t.checkedIn ? '✓' : '&nbsp;&nbsp;&nbsp;&nbsp;'}</td></tr>`).join('');
  const html = wrapHtml('Check-In Sheet', hackathon?.name || 'Hackathon', [
    `<p style="font-size:9px;color:#888;margin-bottom:8px;">Manual check-in form. Mark ✓ when team arrives.</p>`,
    `<table><thead><tr><th>#</th><th>Team ID</th><th>Name</th><th>Leader</th><th>Members</th><th>Room</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>`,
  ]);
  return renderPdf(html);
}

export async function generateRoomDoorSheetPdf(hackathonId: string, roomId?: string): Promise<Buffer> {
  const [hackathon, rooms] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    roomId
      ? prisma.room.findMany({ where: { id: roomId, hackathonId, deletedAt: null } })
      : prisma.room.findMany({ where: { hackathonId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);

  const signs: string[] = [];
  for (const room of rooms) {
    const teams = await prisma.team.findMany({
      where: { hackathonId, room: room.name, deletedAt: null },
      select: { teamId: true, name: true },
      orderBy: { name: 'asc' },
    });
    const teamList = teams.map(t => `${t.teamId || t.name}`).join(', ');
    signs.push(`<div class="door-sign"><h1 style="font-size:28px;color:#0f3460;">${escapeHtml(room.name)}</h1><div class="teams">${teams.length > 0 ? `Teams: ${escapeHtml(teamList)}` : 'No teams assigned'}</div></div>`);
    signs.push('<div class="page-break"></div>');
  }

  const html = wrapHtml('Room Door Sheets', hackathon?.name || 'Hackathon', signs);
  return renderPdf(html);
}

export async function generateTeamDeskCardsPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, teams] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      select: { teamId: true, name: true, room: true, qrToken: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const cards = teams.map(t => {
    const qrDataUrl = t.qrToken ? `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(t.qrToken)}` : '';
    return `<div class="desk-card"><div class="team-name">${escapeHtml(t.name)}</div><div>${escapeHtml(t.teamId || '')}</div><div>${escapeHtml(t.room || '-')}</div>${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" width="60" height="60" /></div>` : ''}</div>`;
  }).join('');

  const html = wrapHtml('Team Desk Cards', hackathon?.name || 'Hackathon', [`<div>${cards}</div>`]);
  return renderPdf(html);
}

export async function generateParticipantBadgesPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, participants] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    prisma.participant.findMany({
      where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
      include: { team: { select: { teamId: true, name: true, qrToken: true } } },
      orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
    }),
  ]);

  const badges = participants.map(p => {
    const qrDataUrl = p.team.qrToken ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(p.team.qrToken)}` : '';
    return `<div class="badge"><div class="name">${escapeHtml(p.name)}</div><div>${escapeHtml(p.team.name)}</div><div>${escapeHtml(p.team.teamId || '')}</div><div style="font-size:7px;color:#888;">${escapeHtml(hackathon?.name || '')}</div>${qrDataUrl ? `<div style="margin-top:3px;"><img src="${qrDataUrl}" width="40" height="40" /></div>` : ''}</div>`;
  }).join('');

  const html = wrapHtml('Participant Badges', hackathon?.name || 'Hackathon', [`<div>${badges}</div>`]);
  return renderPdf(html);
}

async function getTeamListData(hackathonId: string, filters?: { checkedIn?: boolean; unassigned?: boolean; roomId?: string }) {
  const where: any = { hackathonId, deletedAt: null };
  if (filters?.checkedIn === true) where.status = 'CHECKED_IN';
  if (filters?.unassigned === true) where.room = null;
  if (filters?.roomId) {
    const room = await prisma.room.findUnique({ where: { id: filters.roomId } });
    if (room) where.room = room.name;
  }

  const teams = await prisma.team.findMany({
    where,
    include: {
      participants: { where: { isLeader: true } },
      _count: { select: { participants: true } },
    },
    orderBy: { name: 'asc' },
  });

  return teams.map(t => ({
    id: t.id,
    teamId: t.teamId,
    name: t.name,
    leader: t.participants[0]?.name || '',
    participantCount: t._count.participants,
    room: t.room,
    checkedIn: t.status === 'CHECKED_IN',
  }));
}

export function generateTeamMasterListCsv(hackathonId: string): Promise<string> {
  return generateCsv('team-master', hackathonId);
}

export function generateParticipantMasterListCsv(hackathonId: string): Promise<string> {
  return generateCsv('participant-master', hackathonId);
}

export function generateRoomAllocationCsv(hackathonId: string): Promise<string> {
  return generateCsv('room-allocation', hackathonId);
}

export function generateCheckInStatusCsv(hackathonId: string): Promise<string> {
  return generateCsv('checkin-status', hackathonId);
}

async function generateCsv(type: string, hackathonId: string): Promise<string> {
  switch (type) {
    case 'team-master': {
      const teams = await getTeamListData(hackathonId);
      const headers = ['Serial No', 'Team ID', 'Team Name', 'Leader', 'Participant Count', 'Room', 'Check-in Status'];
      const rows = teams.map((t, i) => [String(i + 1), escapeCsv(t.teamId || ''), escapeCsv(t.name), escapeCsv(t.leader), String(t.participantCount), escapeCsv(t.room || ''), t.checkedIn ? 'CHECKED IN' : 'NOT CHECKED IN'].map(String));
      return toCsv(headers, rows);
    }
    case 'participant-master': {
      const participants = await prisma.participant.findMany({
        where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
        include: { team: { select: { teamId: true, name: true, status: true } } },
        orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
      });
      const headers = ['Serial No', 'Name', 'Team ID', 'Team Name', 'Email', 'Phone', 'Check-in Status'];
      const rows = participants.map((p, i) => [String(i + 1), escapeCsv(p.name), escapeCsv(p.team.teamId || ''), escapeCsv(p.team.name), escapeCsv(p.email || ''), escapeCsv(p.phone || ''), p.team.status === 'CHECKED_IN' ? 'CHECKED IN' : ''].map(String));
      return toCsv(headers, rows);
    }
    case 'room-allocation': {
      const rooms = await prisma.room.findMany({
        where: { hackathonId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      const headers = ['Room Name', 'Capacity (Teams)', 'Capacity (People)', 'Team ID', 'Team Name', 'Participant Count', 'Check-in Status'];
      const rows: string[][] = [];
      for (const room of rooms) {
        const teams = await prisma.team.findMany({
          where: { hackathonId, room: room.name, deletedAt: null },
          select: { teamId: true, name: true, status: true, _count: { select: { participants: true } } },
          orderBy: { name: 'asc' },
        });
        if (teams.length === 0) {
          rows.push([escapeCsv(room.name), String(room.capacityTeams ?? ''), String(room.capacityPeople ?? ''), '', '', '', ''].map(String));
        }
        for (const t of teams) {
          rows.push([escapeCsv(room.name), String(room.capacityTeams ?? ''), String(room.capacityPeople ?? ''), escapeCsv(t.teamId || ''), escapeCsv(t.name), String(t._count.participants), t.status === 'CHECKED_IN' ? 'CHECKED IN' : ''].map(String));
        }
      }
      return toCsv(headers, rows);
    }
    case 'checkin-status': {
      const teams = await getTeamListData(hackathonId);
      const headers = ['Team ID', 'Team Name', 'Leader', 'Participant Count', 'Room', 'Checked In?', 'Check-in Time'];
      const rows = teams.map(t => [escapeCsv(t.teamId || ''), escapeCsv(t.name), escapeCsv(t.leader), String(t.participantCount), escapeCsv(t.room || ''), t.checkedIn ? 'Yes' : 'No', ''].map(String));
      return toCsv(headers, rows);
    }
    default:
      throw new Error(`Unknown CSV type: ${type}`);
  }
}

export async function generateTeamMasterListXlsx(hackathonId: string): Promise<Buffer> {
  const teams = await getTeamListData(hackathonId);
  const data = teams.map((t, i) => ({ '#': i + 1, 'Team ID': t.teamId || '', 'Team Name': t.name, Leader: t.leader, Members: t.participantCount, Room: t.room || '', Status: t.checkedIn ? 'CHECKED IN' : 'NOT CHECKED IN' }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Team Master List');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export async function generateParticipantMasterListXlsx(hackathonId: string): Promise<Buffer> {
  const participants = await prisma.participant.findMany({
    where: { team: { hackathonId, deletedAt: null }, deletedAt: null },
    include: { team: { select: { teamId: true, name: true, status: true } } },
    orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
  });
  const data = participants.map((p, i) => ({ '#': i + 1, Name: p.name, 'Team ID': p.team.teamId || '', 'Team Name': p.team.name, Email: p.email || '', Phone: p.phone || '', Status: p.team.status === 'CHECKED_IN' ? 'CHECKED IN' : '' }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Participants');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export async function generateBlankJudgingSheetsPdf(hackathonId: string): Promise<Buffer> {
  const [hackathon, criteria] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId } }),
    prisma.scoringCriteria.findMany({ where: { hackathonId }, orderBy: { name: 'asc' } }),
  ]);

  const teams = await prisma.team.findMany({
    where: { hackathonId, deletedAt: null, status: { notIn: ['DISQUALIFIED'] } },
    select: { id: true, teamId: true, name: true },
    orderBy: { name: 'asc' },
  });

  const criteriaHeaders = criteria.map(c => `<th>${escapeHtml(c.name)} (${c.maxScore})</th>`).join('');
  const tables = teams.map((t, i) => {
    const room = `<tr><th colspan="${criteria.length + 2}" style="text-align:left;background:#16213e;">Team: ${escapeHtml(t.name)} (${escapeHtml(t.teamId || '')})</th></tr>`;
    const headerRow = `<tr><th>Judge</th>${criteriaHeaders}<th>Total</th></tr>`;
    const blankRows = Array.from({ length: 3 }, (_, ri) => `<tr><td>&nbsp;</td>${criteria.map(() => '<td>&nbsp;</td>').join('')}<td>&nbsp;</td></tr>`).join('');
    if (i % 10 === 0 && i > 0) tables.push('<!-- page-break -->');
    return `${room}${headerRow}${blankRows}`;
  });

  const html = wrapHtml('Blank Judging Score Sheets', hackathon?.name || 'Hackathon', [
    `<p style="font-size:9px;color:#888;margin-bottom:8px;">Each team has ${3} judge rows. Max scores in parentheses.</p>`,
    `<table>${tables.join('')}</table>`,
  ]);
  return renderPdf(html, true);
}
