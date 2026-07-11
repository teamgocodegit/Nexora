import { useState, useCallback, useRef, useEffect } from 'react';
import { useHackathonStore } from '@/store/hackathonStore';
import { api } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import {
  Upload, FileSpreadsheet, ChevronRight, ChevronLeft, Check, AlertCircle,
  Loader2, X, ArrowRight, Table2, LayoutGrid, AlertTriangle, Info,
  Search, Download, Clock, History, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'inspect' | 'map' | 'validate' | 'import' | 'complete';

interface SheetInfo {
  name: string;
  rowCount: number;
}

interface Mapping {
  sourceHeader: string;
  targetField: string;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

interface ValidationTeam {
  index: number;
  teamName: string;
  status: 'VALID' | 'WARNING' | 'ERROR';
  errors: string[];
  warnings: string[];
}

interface ImportHistoryItem {
  id: string;
  originalFileName: string;
  fileType: string;
  status: string;
  importedTeams: number;
  importedParticipants: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  totalRows: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string };
  importSummary: Record<string, unknown> | null;
}

const NEXORA_FIELDS = [
  { field: 'teamName', label: 'Team Name', required: true },
  { field: 'leaderName', label: 'Team Leader Name', required: true },
  { field: 'leaderEmail', label: 'Team Leader Email', required: true },
  { field: 'leaderPhone', label: 'Team Leader Phone', required: false },
  { field: 'college', label: 'College / Institution', required: false },
  { field: 'city', label: 'City', required: false },
  { field: 'memberName', label: 'Member Name (Participant rows)', required: false },
  { field: 'memberEmail', label: 'Member Email', required: false },
  { field: 'memberPhone', label: 'Member Phone', required: false },
  { field: 'member2Name', label: 'Member 2 Name (Team rows)', required: false },
  { field: 'member2Email', label: 'Member 2 Email', required: false },
  { field: 'member3Name', label: 'Member 3 Name', required: false },
  { field: 'member3Email', label: 'Member 3 Email', required: false },
  { field: 'member4Name', label: 'Member 4 Name', required: false },
  { field: 'member4Email', label: 'Member 4 Email', required: false },
  { field: 'member5Name', label: 'Member 5 Name', required: false },
  { field: 'member5Email', label: 'Member 5 Email', required: false },
  { field: '', label: 'Ignore column', required: false },
];

const STEP_LABELS = ['Upload', 'Inspect', 'Map', 'Validate', 'Import', 'Done'];

const CONFIG: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  HIGH: { bg: 'rgba(5,150,105,0.08)', text: 'var(--green)', icon: CheckCircle2 },
  MEDIUM: { bg: 'rgba(217,119,6,0.08)', text: 'var(--orange)', icon: AlertTriangle },
  LOW: { bg: 'rgba(220,38,38,0.08)', text: 'var(--red)', icon: XCircle },
};

export function RegistrationDataHub() {
  const { activeHackathon } = useHackathonStore();
  const { toast } = useUIStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [detectedLayout, setDetectedLayout] = useState<{ layout: string; confidence: number } | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [validation, setValidation] = useState<{ teams: ValidationTeam[]; totalValid: number; totalWarnings: number; totalErrors: number } | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [tab, setTab] = useState<'all' | 'valid' | 'warnings' | 'errors'>('all');

  const fetchHistory = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const h = await api.get<ImportHistoryItem[]>(`/hackathons/${activeHackathon.id}/import`);
      setHistory(h);
    } catch {
      // silent
    }
  }, [activeHackathon?.id]);

  useEffect(() => { if (isAdmin) fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    if (!activeHackathon) {
      setStep('upload');
      setBatchId(null);
      setFileName('');
      setSheets([]);
      setHeaders([]);
      setPreviewRows([]);
      setMappings([]);
      setValidation(null);
      setImportResult(null);
    }
  }, [activeHackathon?.id]);

  const handleReset = () => {
    setStep('upload');
    setBatchId(null);
    setFileName('');
    setSheets([]);
    setSelectedSheet('');
    setHeaders([]);
    setPreviewRows([]);
    setTotalRows(0);
    setDetectedLayout(null);
    setMappings([]);
    setValidation(null);
    setImportResult(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!activeHackathon) { toast('Select a hackathon first', 'warning'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast('Unsupported format. Use .xlsx, .xls, or .csv', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('File exceeds 10MB limit', 'error');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/hackathons/${activeHackathon.id}/import/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
        body: formData,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      setBatchId(data.batchId);
      setFileName(file.name);
      setSheets(data.sheets);
      if (data.sheets.length === 1) {
        setSelectedSheet(data.sheets[0].name);
      }
      setStep('inspect');
      toast('File uploaded successfully', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleInspect = async () => {
    if (!activeHackathon || !batchId) return;
    setLoading(true);
    try {
      const data = await api.post<{
        headers: string[]; rows: string[][]; totalRows: number;
        sheets: SheetInfo[]; selectedSheet: string;
        detectedLayout: { layout: string; confidence: number };
        mappings: Mapping[];
      }>(`/hackathons/${activeHackathon.id}/import/${batchId}/inspect`, { sheetName: selectedSheet || undefined });
      setHeaders(data.headers);
      setPreviewRows(data.rows);
      setTotalRows(data.totalRows);
      setDetectedLayout(data.detectedLayout);
      setMappings(data.mappings);
      setStep('map');
      toast('File inspected successfully', 'success');
    } catch (err: any) { toast(err.message, 'error');
    } finally { setLoading(false); }
  };

  const handleMappingChange = (idx: number, targetField: string) => {
    setMappings((prev) => prev.map((m, i) => i === idx ? { ...m, targetField } : m));
  };

  const handleConfirmMapping = async () => {
    if (!activeHackathon || !batchId) return;
    setLoading(true);
    try {
      const layout = detectedLayout?.layout === 'TEAM_PER_ROW' ? 'TEAM_PER_ROW' : 'PARTICIPANT_PER_ROW';
      await api.post(`/hackathons/${activeHackathon.id}/import/${batchId}/map`, {
        mappings: mappings.map((m) => ({ sourceHeader: m.sourceHeader, targetField: m.targetField })),
        layout,
      });
      setStep('validate');
      toast('Mappings confirmed', 'success');
      handleValidate();
    } catch (err: any) { toast(err.message, 'error');
    } finally { setLoading(false); }
  };

  const handleValidate = async () => {
    if (!activeHackathon || !batchId) return;
    setLoading(true);
    try {
      const data = await api.post<{
        validation: { teams: ValidationTeam[]; totalValid: number; totalWarnings: number; totalErrors: number };
        normalization: { totalRecords: number; skippedRows: number[]; errors: Array<{ row: number; message: string }> };
        parsed: { totalRows: number; headers: string[] };
      }>(`/hackathons/${activeHackathon.id}/import/${batchId}/validate`);
      setValidation(data.validation);
      setStep('validate');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!activeHackathon || !batchId) return;
    setLoading(true);
    try {
      const result = await api.post<Record<string, unknown>>(`/hackathons/${activeHackathon.id}/import/${batchId}/import`);
      setImportResult(result);
      setStep('complete');
      fetchHistory();
      toast(`Import complete: ${result.importedTeams} teams created`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
      setStep('complete');
      setImportResult({ error: err.message });
    } finally { setLoading(false); }
  };

  const filteredTeams = validation?.teams.filter((t) => {
    if (tab === 'valid') return t.status === 'VALID';
    if (tab === 'warnings') return t.status === 'WARNING';
    if (tab === 'errors') return t.status === 'ERROR';
    return true;
  }) || [];

  if (!activeHackathon) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No hackathon selected</p>
          <p className="text-caption">Select a hackathon to access the Registration Data Hub.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><XCircle className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">Access restricted</p>
          <p className="text-caption">Only Super Admins can access the Registration Data Hub.</p>
        </div>
      </div>
    );
  }

  const stepIndex = STEP_LABELS.indexOf(step === 'validate' ? (validation ? 'Validate' : 'Map') : step === 'map' ? 'Map' : step === 'inspect' ? 'Inspect' : step === 'complete' ? 'Done' : step === 'import' ? 'Import' : 'Upload');
  const currentStep = STEP_LABELS.indexOf(step === 'validate' ? 'Validate' : step === 'complete' ? 'Done' : step === 'import' ? 'Import' : step);

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-heading">Registration Data Hub</h1>
          <p className="text-caption mt-0.5">Import teams and participants from spreadsheets</p>
        </div>
        <div className="flex items-center gap-2">
          {step !== 'upload' && (
            <button onClick={handleReset} className="btn btn-ghost btn-sm">
              <X className="w-3.5 h-3.5" /> New import
            </button>
          )}
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
            className={cn('btn btn-sm', showHistory ? 'btn-primary' : 'btn-secondary')}
          >
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-1 mb-6 px-1">
        {['Upload', 'Inspect', 'Map', 'Validate', 'Import', 'Done'].map((label, i) => {
          const isActive = i <= currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all',
                  isCurrent ? 'px-3 py-1.5' : 'px-2 py-1.5',
                )}
                style={{
                  background: isActive ? (isCurrent ? 'var(--accent-dim)' : 'var(--green-dim)') : 'var(--bg-elevated)',
                  color: isActive ? (isCurrent ? 'var(--accent)' : 'var(--green)') : 'var(--text-disabled)',
                  border: `1px solid ${isActive ? (isCurrent ? 'rgba(79,70,229,0.2)' : 'rgba(5,150,105,0.2)') : 'var(--border)'}`,
                }}
              >
                {i < currentStep ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < 5 && (
                <div className="flex-1 h-px" style={{ background: i < currentStep ? 'var(--green)' : 'var(--border)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Import History Panel */}
      {showHistory && (
        <div className="card p-4 mb-5 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label">Import History</p>
            <button onClick={() => setShowHistory(false)} className="btn btn-ghost btn-sm">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-caption text-center py-4">No imports yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                  <FileSpreadsheet className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.originalFileName}</p>
                    <p className="text-caption">
                      {h.importedTeams} teams · {h.importedParticipants} participants · {h.createdBy.name}
                    </p>
                  </div>
                  <span className={cn(
                    'badge text-xs',
                    h.status === 'COMPLETED' ? 'badge-checked_in' :
                    h.status === 'PARTIAL' ? 'badge-active' :
                    h.status === 'FAILED' ? 'badge-disqualified' : 'badge-registered'
                  )}>
                    {h.status}
                  </span>
                  <p className="text-caption text-right whitespace-nowrap">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'card p-10 text-center transition-all duration-150 cursor-pointer',
              dragging ? 'border-2 border-dashed' : ''
            )}
            style={{
              borderColor: dragging ? 'var(--accent)' : 'var(--border-strong)',
              background: dragging ? 'var(--accent-dim)' : 'var(--bg-card)',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
              <Upload className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-title mb-2">Upload your registration file</p>
            <p className="text-caption mb-6 max-w-md mx-auto">
              Drag and drop your .xlsx or .csv file here, or click to browse.
              Maximum 10MB. Supports up to 10,000 rows.
            </p>
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="px-3 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                .xlsx
              </span>
              <span className="px-3 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                .csv
              </span>
              <span className="px-3 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                .xls
              </span>
            </div>
            {loading && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Uploading…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step: Inspect */}
      {step === 'inspect' && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              <div>
                <p className="text-title">{fileName}</p>
                <p className="text-caption">{totalRows || '?'} data rows detected</p>
              </div>
            </div>

            {sheets.length > 1 && (
              <div className="mb-4">
                <p className="text-label mb-2">Select Sheet</p>
                <div className="flex gap-2">
                  {sheets.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedSheet(s.name)}
                      className={cn('filter-chip', selectedSheet === s.name && 'active')}
                    >
                      {s.name} ({s.rowCount} rows)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="mb-4">
                <p className="text-label mb-2">Preview (first {Math.min(previewRows.length, 10)} rows)</p>
                <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        {headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-mono font-medium" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} style={{ borderTop: '1px solid var(--border)' }}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 truncate max-w-48" style={{ color: 'var(--text)' }}>
                              {cell || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-caption">{headers.length} columns · {totalRows} rows</p>
              <button onClick={handleInspect} disabled={loading} className="btn btn-primary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue to mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Map */}
      {step === 'map' && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-title">Column Mapping</p>
                <p className="text-caption mt-0.5">
                  Map spreadsheet columns to Nexora fields. {detectedLayout && (
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>
                      Detected: {detectedLayout.layout === 'TEAM_PER_ROW' ? 'One Team Per Row' : 'One Participant Per Row'}
                      ({detectedLayout.confidence}% confidence)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {mappings.map((m, idx) => {
                const conf = CONFIG[m.confidenceLabel] || CONFIG.LOW;
                const ConfIcon = conf.icon;
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.sourceHeader}</p>
                      <p className="text-caption">{m.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                        style={{ background: conf.bg, color: conf.text }}
                      >
                        <ConfIcon className="w-3 h-3" />
                        {m.confidenceLabel} ({m.confidence}%)
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <select
                      value={m.targetField}
                      onChange={(e) => handleMappingChange(idx, e.target.value)}
                      className="input !h-10 text-sm min-w-40"
                    >
                      {NEXORA_FIELDS.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label || 'Ignore column'}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-5">
              <button onClick={() => setStep('inspect')} className="btn btn-ghost">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleConfirmMapping} disabled={loading} className="btn btn-primary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm mappings & validate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Validate */}
      {step === 'validate' && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-title">Preview & Validation</p>
            </div>

            {validation && (
              <>
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--green-dim)' }}>
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--green)' }}>{validation.totalValid} valid</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--orange-dim)' }}>
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--orange)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--orange)' }}>{validation.totalWarnings} warnings</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--red-dim)' }}>
                    <XCircle className="w-4 h-4" style={{ color: 'var(--red)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--red)' }}>{validation.totalErrors} errors</span>
                  </div>
                </div>

                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none">
                  {(['all', 'valid', 'warnings', 'errors'] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                      className={cn('filter-chip', tab === t && 'active')}>
                      {t === 'all' ? 'All' : t === 'valid' ? 'Valid' : t === 'warnings' ? 'Warnings' : 'Errors'}
                      {t === 'all' ? ` (${validation.teams.length})` :
                       t === 'valid' ? ` (${validation.totalValid})` :
                       t === 'warnings' ? ` (${validation.totalWarnings})` :
                       ` (${validation.totalErrors})`}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Team</th>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th className="px-4 py-2.5 text-left font-medium" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.slice(0, 50).map((t) => (
                        <tr key={t.index} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-4 py-3 font-medium">{t.teamName || '(unnamed)'}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'badge text-xs',
                              t.status === 'VALID' ? 'badge-checked_in' :
                              t.status === 'WARNING' ? 'badge-active' : 'badge-disqualified'
                            )}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {t.errors.map((e, i) => (
                              <p key={i} className="text-xs" style={{ color: 'var(--red)' }}>✗ {e}</p>
                            ))}
                            {t.warnings.map((w, i) => (
                              <p key={i} className="text-xs" style={{ color: 'var(--orange)' }}>⚠ {w}</p>
                            ))}
                            {t.errors.length === 0 && t.warnings.length === 0 && (
                              <p className="text-xs" style={{ color: 'var(--green)' }}>✓ No issues</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTeams.length > 50 && (
                    <p className="text-center py-3 text-caption">Showing 50 of {filteredTeams.length} teams</p>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between mt-5">
              <button onClick={() => setStep('map')} className="btn btn-ghost">
                <ChevronLeft className="w-4 h-4" /> Back to mapping
              </button>
              <button
                onClick={handleImport}
                disabled={loading || (validation?.totalValid === 0 && validation?.totalWarnings === 0)}
                className="btn btn-primary"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import {validation?.totalValid ?? 0} teams
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && (
        <div className="card p-8 text-center">
          {importResult?.error ? (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.2)' }}>
                <XCircle className="w-6 h-6" style={{ color: 'var(--red)' }} />
              </div>
              <p className="text-heading mb-2">Import failed</p>
              <p className="text-caption mb-2">{String(importResult.error)}</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.2)' }}>
                <Check className="w-6 h-6" style={{ color: 'var(--green)' }} />
              </div>
              <p className="text-heading mb-2">Import complete</p>
              <p className="text-caption mb-6">{fileName}</p>

              <div className="flex items-center justify-center gap-6 mb-6">
                <div className="text-center">
                  <p className="metric-num-sm" style={{ color: 'var(--green)' }}>{String(importResult?.importedTeams || '0')}</p>
                  <p className="text-caption">Teams</p>
                </div>
                <div className="text-center">
                  <p className="metric-num-sm" style={{ color: 'var(--accent)' }}>{String(importResult?.importedParticipants || '0')}</p>
                  <p className="text-caption">Participants</p>
                </div>
                {(importResult?.failedTeamNames as string[] | undefined)?.length ? (
                  <div className="text-center">
                    <p className="metric-num-sm" style={{ color: 'var(--red)' }}>{(importResult?.failedTeamNames as string[]).length}</p>
                    <p className="text-caption">Failed</p>
                  </div>
                ) : null}
              </div>

              {(importResult?.failedTeamNames as string[] | undefined)?.length ? (
                <div className="mb-6 p-3 rounded-xl" style={{ background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.15)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--red)' }}>Some teams failed to import:</p>
                  {(importResult?.failedTeamNames as string[]).map((name) => (
                    <p key={name} className="text-xs" style={{ color: 'var(--text-secondary)' }}>{name}</p>
                  ))}
                </div>
              ) : null}
            </>
          )}

          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={handleReset} className="btn btn-primary">
              <Upload className="w-4 h-4" /> Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
