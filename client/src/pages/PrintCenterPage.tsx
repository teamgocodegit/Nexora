import { useState } from 'react';
import { useHackathonStore } from '@/store/hackathonStore';
import { FileText, Download, Printer } from 'lucide-react';

interface DocType {
  id: string;
  label: string;
  desc: string;
  hasPdf: boolean;
  hasCsv: boolean;
  hasXlsx: boolean;
}

const DOC_TYPES: DocType[] = [
  { id: 'team-master', label: 'Team Master List', desc: 'All teams with IDs, leaders, and check-in status', hasPdf: true, hasCsv: true, hasXlsx: true },
  { id: 'participant-master', label: 'Participant Master List', desc: 'All participants with team assignments and contact info', hasPdf: true, hasCsv: true, hasXlsx: true },
  { id: 'room-allocation', label: 'Room Allocation Sheet', desc: 'Teams grouped by room with capacities', hasPdf: true, hasCsv: true, hasXlsx: false },
  { id: 'checkin-sheet', label: 'Check-In Sheet', desc: 'Printable manual check-in form with signature area', hasPdf: true, hasCsv: true, hasXlsx: false },
  { id: 'room-door', label: 'Room Door Sheets', desc: 'Printable door signs per room with assigned teams', hasPdf: true, hasCsv: false, hasXlsx: false },
  { id: 'desk-cards', label: 'Team Desk Cards', desc: 'Printable team cards with QR codes', hasPdf: true, hasCsv: false, hasXlsx: false },
  { id: 'badges', label: 'Participant Badges', desc: 'Nametag-style badges with team and QR', hasPdf: true, hasCsv: false, hasXlsx: false },
  { id: 'judging-sheets', label: 'Blank Judging Sheets', desc: 'Score sheets per team with criteria columns', hasPdf: true, hasCsv: false, hasXlsx: false },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function PrintCenterPage() {
  const { activeHackathon } = useHackathonStore();
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!activeHackathon) {
    return <div className="empty-state"><p className="text-title">No hackathon selected</p></div>;
  }

  const downloadUrl = (docType: string, format: 'pdf' | 'csv' | 'xlsx') => {
    return `${API_BASE}/api/hackathons/${activeHackathon.id}/print/${docType}/${format}`;
  };

  const handleDownload = async (docType: string, format: 'pdf' | 'csv' | 'xlsx') => {
    setDownloading(`${docType}-${format}`);
    try {
      const token = localStorage.getItem('nexora-auth');
      const auth = token ? JSON.parse(token) : null;
      const headers: Record<string, string> = {};
      if (auth?.state?.token) headers['Authorization'] = `Bearer ${auth.state.token}`;

      const resp = await fetch(downloadUrl(docType, format), { headers });
      if (!resp.ok) throw new Error('Download failed');

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docType}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloading(null);
    }
  };

  const formatLabel = (fmt: 'pdf' | 'csv' | 'xlsx') => {
    switch (fmt) {
      case 'pdf': return 'PDF';
      case 'csv': return 'CSV';
      case 'xlsx': return 'XLSX';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="flex items-center gap-3 mb-1">
        <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h1 className="text-heading">Print Center</h1>
      </div>
      <p className="text-caption mb-5">Generate operational documents for {activeHackathon.name}</p>

      <div className="grid grid-cols-1 gap-3">
        {DOC_TYPES.map(doc => (
          <div key={doc.id} className="card p-4 flex items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold" style={{ fontSize: 14 }}>{doc.label}</p>
              <p className="text-caption">{doc.desc}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              {doc.hasPdf && (
                <button
                  onClick={() => handleDownload(doc.id, 'pdf')}
                  disabled={downloading === `${doc.id}-pdf`}
                  className="btn btn-sm"
                  style={{ background: 'var(--red-dim)', color: 'var(--red)' }}
                >
                  <Printer className="w-3.5 h-3.5" /> PDF
                </button>
              )}
              {doc.hasCsv && (
                <button
                  onClick={() => handleDownload(doc.id, 'csv')}
                  disabled={downloading === `${doc.id}-csv`}
                  className="btn btn-sm btn-ghost"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              )}
              {doc.hasXlsx && (
                <button
                  onClick={() => handleDownload(doc.id, 'xlsx')}
                  disabled={downloading === `${doc.id}-xlsx`}
                  className="btn btn-sm btn-ghost"
                >
                  <Download className="w-3.5 h-3.5" /> XLSX
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
