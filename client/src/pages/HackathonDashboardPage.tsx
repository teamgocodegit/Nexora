import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity, Users, MessageSquare, Settings, ChevronLeft,
  Link2, UserPlus, Trash2, Check, Edit2,
} from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, cn } from '@/lib/utils';

type Tab = 'overview' | 'coordinators' | 'activity' | 'settings';

interface Coordinator {
  assignmentId: string;
  id: string;
  name: string;
  email?: string;
  assignedTeamCount: number;
}

interface ActivityLog {
  id: string;
  action: string;
  timestamp: string;
  actor: { name: string };
}

export function HackathonDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hackathons, setActiveHackathon, updateHackathon, deleteHackathon } =
    useHackathonStore();
  const { user } = useAuthStore();
  const { toast, setInviteOpen } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const hackathon = hackathons.find((h) => h.id === id);
  const [tab, setTab] = useState<Tab>('overview');
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(hackathon?.name || '');

  useEffect(() => {
    if (!id) return;
    if (tab === 'coordinators') {
      setLoading(true);
      api
        .get<Coordinator[]>(`/hackathons/${id}/coordinators`)
        .then(setCoordinators)
        .finally(() => setLoading(false));
    }
    if (tab === 'activity') {
      setLoading(true);
      api
        .get<ActivityLog[]>(`/hackathons/${id}/activity`)
        .then(setActivity)
        .finally(() => setLoading(false));
    }
  }, [tab, id]);

  if (!hackathon) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-caption">Hackathon not found</p>
      </div>
    );
  }

  const saveName = async () => {
    if (!nameVal.trim()) return;
    try {
      await updateHackathon(hackathon.id, { name: nameVal.trim() });
      toast('Name updated', 'success');
      setEditName(false);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const [confirmText, setConfirmText] = useState('');
  const [deleteImpact, setDeleteImpact] = useState<any>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    try {
      const result = await deleteHackathon(hackathon.id, confirmText);
      if (result.success) {
        toast('Hackathon archived. All data preserved.', 'success');
        navigate('/hackathons');
      }
    } catch (e: any) {
      if (e.status === 400 && e.message.includes('Type-to-confirm')) {
        const impact = deleteImpact;
        setDeleteError(`Type HACKATHON-${hackathon.name.toUpperCase().replace(/\s+/g, '-').slice(0, 40)} to confirm`);
      } else {
        toast(e.message, 'error');
      }
    }
  };

  const startDelete = async () => {
    try {
      await api.delete<any>(`/hackathons/${hackathon.id}`, { data: { confirm: '' } });
    } catch (e: any) {
      if (e.status === 400 && e.data) {
        setDeleteImpact(e.data.impact || { teams: 0, rooms: 0, registrations: 0, certificates: 0 });
        setConfirmDelete(true);
      } else {
        toast(e.message, 'error');
      }
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
    { key: 'coordinators', label: 'Team', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'activity', label: 'Activity', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    ...(isAdmin
      ? [{ key: 'settings' as Tab, label: 'Settings', icon: <Settings className="w-3.5 h-3.5" /> }]
      : []),
  ];

  const statusColor =
    hackathon.status === 'ACTIVE'
      ? 'var(--green)'
      : hackathon.status === 'ENDED'
      ? 'var(--text-muted)'
      : 'var(--yellow)';

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      {/* Back */}
      <button
        onClick={() => navigate('/hackathons')}
        className="flex items-center gap-1.5 text-caption mb-5 press transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to hackathons
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex-1 min-w-0">
          {editName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditName(false);
                }}
                className="input flex-1"
                style={{ fontSize: 20, fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
              />
              <button className="btn btn-primary btn-icon btn-sm" onClick={saveName}>
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1
                className="text-heading cursor-pointer"
                onClick={() => isAdmin && setEditName(true)}
              >
                {hackathon.name}
              </h1>
              {isAdmin && (
                <Edit2
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => setEditName(true)}
                />
              )}
            </div>
          )}
          <p className="text-caption mt-1">
            {formatDate(hackathon.startDate)} → {formatDate(hackathon.endDate)}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0"
          style={{
            background:
              hackathon.status === 'ACTIVE' ? 'var(--green-dim)' : 'var(--bg-elevated)',
            border: `1px solid ${hackathon.status === 'ACTIVE' ? 'rgba(0,232,122,0.25)' : 'var(--border-strong)'}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
          />
          <span
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: statusColor, textTransform: 'uppercase' }}
          >
            {hackathon.status}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('tab-item', tab === t.key && 'active')}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-0 divide-y" style={{ '--tw-divide-opacity': 1 } as any}>
            {[
              { label: 'Venue', value: hackathon.venue || 'Not set' },
              { label: 'Max teams', value: hackathon.maxTeams?.toString() || 'Unlimited' },
              { label: 'Mode', value: hackathon.mode?.replace('_', ' ') || 'Predefined' },
              { label: 'Total teams', value: `${hackathon._count?.teams ?? 0}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex justify-between items-center py-3 first:pt-0 last:pb-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-caption">{label}</span>
                <span className="font-medium" style={{ fontSize: 14 }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="card p-4">
              <p className="text-label mb-3">Quick actions</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setActiveHackathon(hackathon); setInviteOpen(true); }}
                  className="btn btn-secondary btn-sm"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Invite coordinators
                </button>
                <button
                  onClick={() => { setActiveHackathon(hackathon); navigate('/teams'); }}
                  className="btn btn-secondary btn-sm"
                >
                  <Users className="w-3.5 h-3.5" />
                  Manage teams
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coordinators */}
      {tab === 'coordinators' && (
        <div className="space-y-3">
          {isAdmin && (
            <button
              onClick={() => { setActiveHackathon(hackathon); setInviteOpen(true); }}
              className="btn btn-primary w-full"
              style={{ height: 44 }}
            >
              <UserPlus className="w-4 h-4" />
              Invite coordinator via link
            </button>
          )}
          {loading ? (
            <div className="card overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="skeleton w-9 h-9 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-32 rounded" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : coordinators.length === 0 ? (
            <div className="empty-state">
              <p className="text-caption">No coordinators assigned yet</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {coordinators.map((c) => (
                <div
                  key={c.assignmentId}
                  className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold flex-shrink-0"
                    style={{ fontSize: 12, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }}
                  >
                    {c.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ fontSize: 14 }}>{c.name}</p>
                    <p className="text-caption">{c.email} · {c.assignedTeamCount} teams</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="empty-state">
            <p className="text-caption">No activity recorded yet</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {activity.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 px-4 py-3 border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: 'var(--purple)' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium" style={{ fontSize: 13 }}>
                    {log.action}
                  </p>
                  <p className="text-caption mt-0.5">
                    {log.actor.name} · {formatDateTime(log.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Settings */}
      {tab === 'settings' && isAdmin && (
        <div className="space-y-4">
          {/* Status control */}
          <div className="card p-4">
            <p className="text-label mb-3">Status</p>
            <div className="flex gap-2">
              {(['DRAFT', 'ACTIVE', 'ENDED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => updateHackathon(hackathon.id, { status: s })}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  style={{
                    background: hackathon.status === s ? 'var(--text)' : 'var(--bg-elevated)',
                    color: hackathon.status === s ? 'var(--bg)' : 'var(--text-secondary)',
                    border: hackathon.status === s ? '1px solid transparent' : '1px solid var(--border-strong)',
                    fontFamily: 'Syne, sans-serif',
                    letterSpacing: '0.02em',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="card p-4">
            <p className="text-label mb-3" style={{ color: 'var(--red)' }}>
              Danger zone
            </p>
            {!confirmDelete ? (
              <button onClick={startDelete} className="btn btn-danger w-full">
                <Trash2 className="w-3.5 h-3.5" />
                Archive & delete hackathon
              </button>
            ) : (
              <div
                className="p-4 rounded-xl"
                style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)' }}
              >
                {deleteImpact && (
                  <div className="mb-3 text-xs space-y-1" style={{ color: 'var(--red)' }}>
                    <p className="font-semibold">Impact summary:</p>
                    <p>Teams: {deleteImpact.teams} · Rooms: {deleteImpact.rooms}</p>
                    <p>Registrations: {deleteImpact.registrations} · Certificates: {deleteImpact.certificates}</p>
                  </div>
                )}
                <p className="font-semibold mb-2" style={{ fontSize: 14, color: 'var(--red)' }}>
                  Type the confirmation string to archive
                </p>
                <p className="text-xs mb-2" style={{ color: 'var(--red)', opacity: 0.7 }}>
                  Teams and participants will be soft-deleted. Recovery is possible via the Reliability Center.
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type HACKATHON-${hackathon.name.toUpperCase().replace(/\s+/g, '-').slice(0, 40)}`}
                  className="input mb-2"
                  style={{ background: 'var(--bg)', borderColor: 'var(--red)' }}
                />
                {deleteError && <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{deleteError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleDelete} className="btn btn-danger flex-1">
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm archive
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setConfirmText(''); setDeleteError(''); }}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
