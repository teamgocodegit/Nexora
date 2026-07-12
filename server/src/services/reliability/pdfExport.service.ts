import { prisma } from '../../lib/prisma';
import { generateEmergencyPack } from './export.service';
import { logger } from '../../lib/logger';

let puppeteer: any = null;

async function getBrowser(): Promise<any> {
  if (!puppeteer) {
    puppeteer = await import('puppeteer');
  }
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateOperationalHtml(pack: any): string {
  const hackathon = pack.hackathon || {};
  const teams = pack.teams?.data || [];
  const participants = pack.participants?.data || [];
  const rooms = pack.rooms?.data || [];

  const teamRows = teams.map((t: any) =>
    `<tr><td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.room || '-')}</td><td>${t.participants}</td></tr>`
  ).join('');

  const participantRows = participants.map((p: any) =>
    `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.email)}</td><td>${escapeHtml(p.team)}</td><td>${p.isLeader ? 'Yes' : ''}</td></tr>`
  ).join('');

  const roomRows = rooms.map((r: any) =>
    `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.building || '-')}</td><td>${r.floor || '-'}</td><td>${r.capacity}</td><td>${r.teamsAssigned}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(hackathon.name || 'Hackathon')} - Emergency Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a2e; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; color: #0f3460; }
  h2 { font-size: 14px; margin: 16px 0 8px; color: #16213e; border-bottom: 2px solid #e94560; padding-bottom: 4px; }
  .meta { font-size: 10px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #0f3460; color: #fff; font-weight: 600; }
  tr:nth-child(even) { background: #f5f5f5; }
  .summary { display: flex; gap: 12px; margin-bottom: 12px; }
  .card { background: #f0f4ff; border: 1px solid #d0d8f0; border-radius: 6px; padding: 8px 12px; flex: 1; }
  .card .num { font-size: 20px; font-weight: 700; color: #0f3460; }
  .card .label { font-size: 9px; color: #666; text-transform: uppercase; }
  .footer { margin-top: 24px; font-size: 8px; color: #888; text-align: center; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${escapeHtml(hackathon.name || 'Nexora Hackathon')}</h1>
  <div class="meta">
    Report generated: ${new Date().toISOString()}<br>
    Status: ${escapeHtml(hackathon.status || '')} | Venue: ${escapeHtml(hackathon.venue || '-')}
  </div>
  <div class="summary">
    <div class="card"><div class="num">${pack.teams?.count || 0}</div><div class="label">Teams</div></div>
    <div class="card"><div class="num">${pack.teams?.checkedIn || 0}</div><div class="label">Checked In</div></div>
    <div class="card"><div class="num">${pack.participants?.count || 0}</div><div class="label">Participants</div></div>
    <div class="card"><div class="num">${pack.rooms?.count || 0}</div><div class="label">Rooms</div></div>
  </div>
  <h2>Teams</h2>
  <table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Room</th><th>Members</th></tr></thead><tbody>${teamRows || '<tr><td colspan="5">No teams</td></tr>'}</tbody></table>
  <h2>Participants</h2>
  <table><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Leader</th></tr></thead><tbody>${participantRows || '<tr><td colspan="4">No participants</td></tr>'}</tbody></table>
  <h2>Room Allocations</h2>
  <table><thead><tr><th>Room</th><th>Building</th><th>Floor</th><th>Capacity</th><th>Teams</th></tr></thead><tbody>${roomRows || '<tr><td colspan="5">No rooms</td></tr>'}</tbody></table>
  <div class="footer">Nexora Emergency Report · SHA-256 verified · ${new Date().toISOString().split('T')[0]}</div>
</body></html>`;
}

export async function generateEmergencyPdf(hackathonId: string): Promise<Buffer> {
  const pack = await generateEmergencyPack(hackathonId);
  const html = generateOperationalHtml(pack);
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
