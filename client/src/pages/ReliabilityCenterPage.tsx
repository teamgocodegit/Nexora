import { useState, useEffect, useCallback } from 'react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import {
  Shield, RefreshCw, Database, Download, FileText, Archive,
  RotateCcw, AlertTriangle, CheckCircle2, XCircle, Clock,
  Trash2, Upload, Users, Loader2, ChevronDown, ChevronRight,
  Search, Eye, Mail, HardDrive, Activity, Server, DoorOpen,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';

type Tab = 'overview' | 'recovery' | 'snapshots' | 'exports' | 'integrity' | 'stuck';

interface HealthReport {
  dbConnectivity: string;
  apiHealthy: boolean;
  hackathon: { id: string; name: string; status: string; archived: boolean } | null;
  teamCount: number;
  participantCount: number;
  checkinProgress: number;
  lastSnapshot: { id: string; type: string; createdAt: string; integrity: string } | null;
  integrityStatus: string;
  stuckJobsCount: number;
  activeEmailCampaigns: number;
}

interface Snapshot {
  id: string;
  type: string;
  status: string;
  schemaVersion: number;
  checksum: string | null;
  recordCounts: Record<string, number> | null;
  size: number | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string };
}

interface IntegrityIssue {
  type: string;
  severity: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  explanation: string;
  suggestedAction: string;
}

interface StuckJob {
  type: string;
  id: string;
  name: string;
  status: string;
  stuckForMinutes: number;
  recoverable: boolean;
  recoveryAction: string;
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  HEALTHY: { bg: 'var(--green-dim)', text: 'var(--green)' },
  WARNING: { bg: 'var(--orange-dim)', text: 'var(--orange)' },
  CRITICAL: { bg: 'var(--red-dim)', text: 'var(--red)' },
  UNKNOWN: { bg: 'var(--bg-muted)', text: 'var(--text-muted)' },
  UNVERIFIED: { bg: 'var(--yellow-dim)', text: 'var(--yellow)' },
  NONE: { bg: 'var(--bg-muted)', text: 'var(--text-disabled)' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.UNKNOWN;
  return (
    <span className="badge text-xs font-mono" style={{ background: cfg.bg, color: cfg.text }}>
      {status}
    </span>
  );
}

export function ReliabilityCenterPage() {
  const { activeHackathon } = useHackathonStore();
  const { toast } = useUIStore();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('overview');

  const [health, setHealth] = useState<HealthReport | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [issues, setIssues] = useState<IntegrityIssue[]>([]);
  const [integrityOverall, setIntegrityOverall] = useState<string>('UNKNOWN');
  const [stuckJobs, setStuckJobs] = useState<StuckJob[]>([]);
  const [recoveryRecords, setRecoveryRecords] = useState<any>(null);

  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [snapshotType, setSnapshotType] = useState('MANUAL');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; expected: string; computed: string } | null>(null);
  const [restorePlan, setRestorePlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const userIsAdmin = user?.role === 'SUPER_ADMIN';

  const fetchHealth = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const data = await api.get<HealthReport>(`/hackathons/${activeHackathon.id}/reliability/health`);
      setHealth(data);
    } catch {}
  }, [activeHackathon?.id]);

  const fetchSnapshots = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const data = await api.get<Snapshot[]>(`/hackathons/${activeHackathon.id}/reliability/snapshots`);
      setSnapshots(data);
    } catch {}
  }, [activeHackathon?.id]);

  const fetchIntegrity = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const data = await api.get<{ overall: string; issues: IntegrityIssue[] }>(`/hackathons/${activeHackathon.id}/reliability/integrity`);
      setIssues(data.issues || []);
      setIntegrityOverall(data.overall);
    } catch {}
  }, [activeHackathon?.id]);

  const fetchStuckJobs = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const data = await api.get<StuckJob[]>(`/hackathons/${activeHackathon.id}/reliability/stuck-jobs`);
      setStuckJobs(data);
    } catch {}
  }, [activeHackathon?.id]);

  const fetchRecoveryRecords = useCallback(async () => {
    if (!activeHackathon) return;
    try {
      const data = await api.get<any>(`/hackathons/${activeHackathon.id}/reliability/recovery`);
      setRecoveryRecords(data);
    } catch {}
  }, [activeHackathon?.id]);

  useEffect(() => {
    if (tab === 'overview') fetchHealth();
    if (tab === 'snapshots') fetchSnapshots();
    if (tab === 'integrity') fetchIntegrity();
    if (tab === 'stuck') fetchStuckJobs();
    if (tab === 'recovery') fetchRecoveryRecords();
  }, [tab, fetchHealth, fetchSnapshots, fetchIntegrity, fetchStuckJobs, fetchRecoveryRecords]);

  const handleCreateSnapshot = async () => {
    if (!activeHackathon) return;
    setCreatingSnapshot(true);
    try {
      const result = await api.post<{ id: string }>(`/hackathons/${activeHackathon.id}/reliability/snapshots`, { type: snapshotType });
      toast(`Snapshot created: ${result.id.slice(0, 8)}...`, 'success');
      fetchSnapshots();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setCreatingSnapshot(false); }
  };

  const handleVerifySnapshot = async (snapshotId: string) => {
    if (!activeHackathon) return;
    try {
      const result = await api.get<{ valid: boolean; expected: string; computed: string }>(
        `/hackathons/${activeHackathon.id}/reliability/snapshots/${snapshotId}/verify`
      );
      setVerifyResult(result);
      toast(result.valid ? 'Checksum valid' : 'Checksum MISMATCH — data may be corrupted!', result.valid ? 'success' : 'error');
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleRestorePlan = async (snapshotId: string) => {
    if (!activeHackathon) return;
    try {
      const result = await api.get<any>(
        `/hackathons/${activeHackathon.id}/reliability/snapshots/${snapshotId}/restore-plan`
      );
      setRestorePlan(result);
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleRecoverImport = async (batchId: string) => {
    if (!activeHackathon) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/stuck-jobs/import/${batchId}/recover`);
      toast('Import recovered', 'success');
      fetchStuckJobs();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleRecoverCampaign = async (campaignId: string) => {
    if (!activeHackathon) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/stuck-jobs/campaign/${campaignId}/recover`);
      toast('Campaign recovered', 'success');
      fetchStuckJobs();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleArchive = async () => {
    if (!activeHackathon) return;
    if (!confirm('Archive this hackathon? Teams, rooms, and registrations will be preserved but hidden from active views.')) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/archive`);
      toast('Hackathon archived', 'success');
      fetchHealth();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleUnarchive = async () => {
    if (!activeHackathon) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/unarchive`);
      toast('Hackathon unarchived', 'success');
      fetchHealth();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleRestoreTeam = async (teamId: string) => {
    if (!activeHackathon) return;
    if (!confirm('Restore this team and its participants?')) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/restore/team/${teamId}`);
      toast('Team restored', 'success');
      fetchRecoveryRecords();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleRestoreRoom = async (roomId: string) => {
    if (!activeHackathon) return;
    if (!confirm('Restore this room?')) return;
    try {
      await api.post(`/hackathons/${activeHackathon.id}/reliability/restore/room/${roomId}`);
      toast('Room restored', 'success');
      fetchRecoveryRecords();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  if (!activeHackathon) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6">
        <div className="empty-state">
          <div className="empty-icon"><Shield className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No hackathon selected</p>
          <p className="text-caption">Select a hackathon to access the Reliability Center.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: Activity },
    { id: 'recovery' as Tab, label: 'Recovery', icon: RotateCcw },
    { id: 'snapshots' as Tab, label: 'Snapshots', icon: HardDrive },
    { id: 'exports' as Tab, label: 'Exports', icon: Download },
    { id: 'integrity' as Tab, label: 'Integrity', icon: Search },
    { id: 'stuck' as Tab, label: 'Stuck Jobs', icon: Clock },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-heading">Reliability Center</h1>
            <p className="text-caption mt-0.5">{activeHackathon.name}</p>
          </div>
        </div>
        <button onClick={fetchHealth} className="btn btn-ghost btn-icon btn-sm" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-none bg-[var(--bg-elevated)] rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.id ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ───── Overview Tab ───── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Health cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4" style={{ color: health?.dbConnectivity === 'HEALTHY' ? 'var(--green)' : 'var(--red)' }} />
                <p className="text-label">Database</p>
              </div>
              <StatusBadge status={health?.dbConnectivity || 'UNKNOWN'} />
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-4 h-4" style={{ color: health?.apiHealthy ? 'var(--green)' : 'var(--red)' }} />
                <p className="text-label">API</p>
              </div>
              <StatusBadge status={health?.apiHealthy ? 'HEALTHY' : 'CRITICAL'} />
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" style={{ color: integrityStatusColor(integrityOverall) }} />
                <p className="text-label">Integrity</p>
              </div>
              <StatusBadge status={integrityOverall} />
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4" style={{ color: 'var(--text)' }} />
                <p className="text-label">Teams</p>
              </div>
              <p className="metric-num" style={{ color: 'var(--text)' }}>{health?.teamCount || 0}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="card p-4">
            <p className="text-label mb-3">Event-Day Status</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="metric-num-sm">{health?.teamCount || 0}</p>
                <p className="text-caption">Teams</p>
              </div>
              <div>
                <p className="metric-num-sm">{health?.participantCount || 0}</p>
                <p className="text-caption">Participants</p>
              </div>
              <div>
                <p className="metric-num-sm">{health?.checkinProgress || 0}%</p>
                <p className="text-caption">Check-in Progress</p>
              </div>
              <div>
                <p className="metric-num-sm">{health?.activeEmailCampaigns || 0}</p>
                <p className="text-caption">Active Email Campaigns</p>
              </div>
            </div>
          </div>

          {/* Snapshot status */}
          <div className="card p-4">
            <p className="text-label mb-2">Last Snapshot</p>
            {health?.lastSnapshot ? (
              <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>{health.lastSnapshot.type}</span>
                <span>·</span>
                <span>{formatDateTime(health.lastSnapshot.createdAt)}</span>
                <span>·</span>
                <StatusBadge status={health.lastSnapshot.integrity} />
              </div>
            ) : (
              <p className="text-caption">No snapshots taken</p>
            )}
          </div>

          {/* Archive action */}
          <div className="card p-4">
            <p className="text-label mb-2">Hackathon State</p>
            <div className="flex items-center gap-3">
              <StatusBadge status={health?.hackathon?.archived ? 'ARCHIVED' : 'ACTIVE'} />
              {!health?.hackathon?.archived ? (
                <button onClick={handleArchive} className="btn btn-ghost btn-sm" style={{ color: 'var(--orange)' }}>
                  <Archive className="w-3.5 h-3.5" /> Archive this hackathon
                </button>
              ) : (
                <button onClick={handleUnarchive} className="btn btn-ghost btn-sm" style={{ color: 'var(--green)' }}>
                  <RotateCcw className="w-3.5 h-3.5" /> Unarchive
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───── Recovery Tab ───── */}
      {tab === 'recovery' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-label">Recoverable Records</p>
            <button onClick={fetchRecoveryRecords} className="btn btn-ghost btn-sm">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Deleted Teams */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              <p className="text-label">Deleted Teams ({recoveryRecords?.teams?.length || 0})</p>
            </div>
            {recoveryRecords?.teams?.length > 0 ? (
              recoveryRecords.teams.map((team: any) => (
                <div key={team.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <Trash2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium">{team.name}</p>
                    <p className="text-caption truncate">
                      Deleted by {team.deletedBy?.name || 'Unknown'} · {team.deletedAt ? formatDateTime(team.deletedAt) : ''}
                      {team.deletionReason ? ` · "${team.deletionReason}"` : ''}
                    </p>
                  </div>
                  <button onClick={() => handleRestoreTeam(team.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--green)' }}>
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-caption">No deleted teams</div>
            )}
          </div>

          {/* Deleted Rooms */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              <p className="text-label">Deleted Rooms ({recoveryRecords?.rooms?.length || 0})</p>
            </div>
            {recoveryRecords?.rooms?.length > 0 ? (
              recoveryRecords.rooms.map((room: any) => (
                <div key={room.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <Trash2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--orange)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium">{room.name}</p>
                    <p className="text-caption truncate">
                      Deleted by {room.deletedBy?.name || 'Unknown'} · {room.deletedAt ? formatDateTime(room.deletedAt) : ''}
                    </p>
                  </div>
                  <button onClick={() => handleRestoreRoom(room.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--green)' }}>
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-caption">No deleted rooms</div>
            )}
          </div>
        </div>
      )}

      {/* ───── Snapshots Tab ───── */}
      {tab === 'snapshots' && (
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-label mb-3">Create Snapshot</p>
            <div className="flex items-center gap-2">
              <select value={snapshotType} onChange={(e) => setSnapshotType(e.target.value)} className="input flex-1">
                <option value="MANUAL">Manual</option>
                <option value="PRE_EVENT">Pre-Event</option>
                <option value="EVENT_START">Event Start</option>
                <option value="MID_EVENT">Mid-Event</option>
                <option value="PRE_JUDGING">Pre-Judging</option>
                <option value="PRE_RESULTS">Pre-Results</option>
                <option value="FINAL">Final</option>
                <option value="AUTOMATIC">Automatic</option>
              </select>
              <button onClick={handleCreateSnapshot} disabled={creatingSnapshot} className="btn btn-primary">
                {creatingSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                Create
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              <div className="flex items-center justify-between">
                <p className="text-label">Snapshots ({snapshots.length})</p>
                <button onClick={fetchSnapshots} className="btn btn-ghost btn-sm"><RefreshCw className="w-3 h-3" /></button>
              </div>
            </div>
            {snapshots.length > 0 ? (
              snapshots.map((s) => {
                const counts = s.recordCounts ? Object.entries(s.recordCounts).filter(([_, v]) => v > 0) : null;
                return (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <HardDrive className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge text-xs">{s.type}</span>
                        <StatusBadge status={s.status} />
                        {s.size !== null && (
                          <span className="text-caption">{(s.size / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                      <p className="text-caption">
                        Created by {s.createdBy.name} · {formatDateTime(s.createdAt)}
                      </p>
                      {counts && (
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {counts.map(([key, val]) => (
                            <span key={key} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                              {key}: {val}
                            </span>
                          ))}
                        </div>
                      )}
                      {s.failureReason && (
                        <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{s.failureReason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleVerifySnapshot(s.id)}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Verify checksum"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRestorePlan(s.id)}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Restore plan"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-caption">No snapshots yet</div>
            )}
          </div>

          {verifyResult && (
            <div className={cn('card p-4', verifyResult.valid ? 'border-[var(--green)]' : 'border-[var(--red)]')} style={{ borderWidth: 1 }}>
              <p className="text-label mb-2">Verification Result</p>
              <StatusBadge status={verifyResult.valid ? 'VALID' : 'CORRUPTED'} />
              <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                Expected: {verifyResult.expected.slice(0, 32)}…<br />
                Computed: {verifyResult.computed.slice(0, 32)}…
              </p>
            </div>
          )}

          {restorePlan && (
            <div className="card p-4">
              <p className="text-label mb-2">Restore Plan (Dry Run)</p>
              <StatusBadge status={restorePlan.restoreDisabled ? 'DISABLED' : 'ENABLED'} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Automatic restore is disabled for safety. Use the Emergency Export for manual recovery.
              </p>
              {restorePlan.restoreBlockers?.length > 0 && (
                <div className="mt-2">
                  {restorePlan.restoreBlockers.map((b: string, i: number) => (
                    <p key={i} className="text-xs flex items-center gap-1" style={{ color: 'var(--red)' }}>
                      <XCircle className="w-3 h-3" /> {b}
                    </p>
                  ))}
                </div>
              )}
              {restorePlan.currentCounts && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  {Object.entries(restorePlan.currentCounts).map(([key, val]) => (
                    <div key={key} className="flex justify-between px-2 py-1 rounded" style={{ background: 'var(--bg-elevated)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{key}</span>
                      <span>{String(val)} → {restorePlan.snapshotCounts?.[key] || '?'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ───── Exports Tab ───── */}
      {tab === 'exports' && (
        <div className="space-y-4">
          <p className="text-label">Emergency Exports</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/teams`} icon={Users} label="Team Master List" desc="All teams with IDs, status, room assignments" />
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/participants`} icon={Users} label="Participant List" desc="All participants with names, emails, team names" />
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/checkin`} icon={CheckCircle2} label="Check-in Status" desc="Team check-in times and status" />
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/rooms`} icon={DoorOpen} label="Room Assignments" desc="Room capacity and team counts" />
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/scores`} icon={FileText} label="Scores" desc="Team scores by criteria (CSV)" />
            <ExportCard href={`/api/hackathons/${activeHackathon.id}/reliability/export/emergency-pack`} icon={Download} label="Emergency Event Pack" desc="Complete JSON export for offline operations" highlight />
          </div>
        </div>
      )}

      {/* ───── Integrity Tab ───── */}
      {tab === 'integrity' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-label">Data Integrity Check</p>
            <button onClick={fetchIntegrity} className="btn btn-secondary btn-sm">
              <RefreshCw className="w-3.5 h-3.5" /> Run check
            </button>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-label">Overall Status</p>
              <StatusBadge status={integrityOverall} />
            </div>
            <p className="text-caption">
              {issues.length === 0
                ? 'No integrity issues found. Data appears healthy.'
                : `${issues.length} issue(s) found.`}
            </p>
          </div>

          {issues.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                <p className="text-label">Issues ({issues.length})</p>
              </div>
              {issues.map((issue, i) => (
                <div key={i} className="px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-start gap-3">
                    {issue.severity === 'CRITICAL' ? (
                      <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--orange)' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium">{issue.type}</span>
                        <StatusBadge status={issue.severity} />
                        {issue.entityName && (
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{issue.entityName}</span>
                        )}
                      </div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{issue.explanation}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Suggested: {issue.suggestedAction}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── Stuck Jobs Tab ───── */}
      {tab === 'stuck' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-label">Stuck Operations</p>
            <button onClick={fetchStuckJobs} className="btn btn-ghost btn-sm"><RefreshCw className="w-3 h-3" /> Refresh</button>
          </div>

          {stuckJobs.length > 0 ? (
            stuckJobs.map((job) => (
              <div key={`${job.type}-${job.id}`} className="card p-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--orange)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge text-xs">{job.type}</span>
                      <span className="text-sm font-medium">{job.name}</span>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Stuck for {job.stuckForMinutes} minutes · Status: {job.status}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{job.recoveryAction}</p>
                  </div>
                  {job.recoverable && (
                    <button
                      onClick={() => job.type === 'IMPORT' ? handleRecoverImport(job.id) : handleRecoverCampaign(job.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      <RotateCcw className="w-3 h-3" /> Recover
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="card p-6 text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--green)' }} />
              <p className="text-caption">No stuck jobs found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExportCard({ href, icon: Icon, label, desc, highlight }: { href: string; icon: any; label: string; desc: string; highlight?: boolean }) {
  return (
    <div className={cn('card p-4', highlight && 'ring-2 ring-[var(--accent)]')}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: highlight ? 'var(--accent)' : 'var(--text-muted)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-0.5">{label}</p>
          <p className="text-caption mb-2">{desc}</p>
          <a href={href} className="btn btn-secondary btn-sm w-full" download>
            <Download className="w-3 h-3" /> Download CSV
          </a>
        </div>
      </div>
    </div>
  );
}

function integrityStatusColor(status: string): string {
  switch (status) {
    case 'HEALTHY': return 'var(--green)';
    case 'WARNING': return 'var(--orange)';
    case 'CRITICAL': return 'var(--red)';
    default: return 'var(--text-muted)';
  }
}
