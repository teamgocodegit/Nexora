export interface TemplateData {
  participantName: string;
  teamName: string;
  hackathonName: string;
  certificateType: string;
  issueDate: string;
  certificateId: string;
  qrDataUrl: string;
}

const TYPE_LABELS: Record<string, string> = {
  PARTICIPATION: 'Participation',
  WINNER: 'Winner',
  RUNNER_UP: 'Runner Up',
  SPECIAL: 'Special Recognition',
};

export function renderCertificateTemplate(data: TemplateData): string {
  const typeLabel = TYPE_LABELS[data.certificateType] || data.certificateType;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 794px; height: 1123px;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #faf9f6;
    display: flex; align-items: center; justify-content: center;
  }
  .certificate {
    width: 720px; height: 1000px;
    background: #fff;
    border: 2px solid #d4a843;
    position: relative;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 60px 80px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }
  .border-decor {
    position: absolute; inset: 12px;
    border: 1px solid #d4a843;
    pointer-events: none;
  }
  .cert-title {
    font-size: 14px; letter-spacing: 3px; text-transform: uppercase;
    color: #d4a843; margin-bottom: 8px;
  }
  .type-label {
    font-size: 28px; font-weight: 400; color: #d4a843;
    font-style: italic; margin-bottom: 28px;
  }
  .presented-to {
    font-size: 13px; color: #888; margin-bottom: 8px;
  }
  .participant-name {
    font-size: 42px; font-weight: 700; color: #1a1a2e;
    margin-bottom: 12px; text-align: center;
  }
  .team-line {
    font-size: 15px; color: #555; margin-bottom: 8px;
  }
  .team-name { font-weight: 600; color: #1a1a2e; }
  .hackathon-name {
    font-size: 20px; font-weight: 600; color: #1a1a2e;
    margin-bottom: 40px; text-align: center;
  }
  .details { display: flex; gap: 48px; margin-bottom: 40px; }
  .detail-item { text-align: center; }
  .detail-label {
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    color: #999; margin-bottom: 4px;
  }
  .detail-value { font-size: 13px; color: #333; }
  .qr-section {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px;
    background: #f8f7f4; border-radius: 8px;
  }
  .qr-section img { width: 56px; height: 56px; }
  .qr-text { font-size: 10px; color: #888; line-height: 1.4; }
  .cert-id { font-size: 9px; color: #bbb; margin-top: 20px; }
</style>
</head>
<body>
<div class="certificate">
  <div class="border-decor"></div>
  <div class="cert-title">Certificate of</div>
  <div class="type-label">${typeLabel}</div>
  <div class="presented-to">Presented to</div>
  <div class="participant-name">${escapeHtml(data.participantName)}</div>
  <div class="team-line">For successfully participating in <span class="team-name">${escapeHtml(data.teamName)}</span></div>
  <div class="hackathon-name">${escapeHtml(data.hackathonName)}</div>
  <div class="details">
    <div class="detail-item">
      <div class="detail-label">Date</div>
      <div class="detail-value">${data.issueDate}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Certificate ID</div>
      <div class="detail-value" style="font-family: monospace; font-size: 11px;">${data.certificateId}</div>
    </div>
  </div>
  <div class="qr-section">
    <img src="${data.qrDataUrl}" alt="QR Code" />
    <div class="qr-text">Scan to verify<br />this certificate</div>
  </div>
  <div class="cert-id">${data.certificateId}</div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
