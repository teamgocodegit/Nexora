import { useEffect, useState } from 'react';
import { ArrowUpRight, Users, UserCheck, Send, Zap, Clock, Link2, Activity, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useHackathonStore } from '@/store/hackathonStore';
import { useTeamsStore } from '@/store/teamsStore';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import { cn, formatDate, pluralize } from '@/lib/utils';

interface Metrics {
  totalTeams: number;
  checkedIn: number;
  checkedInPercent: number;
  active: number;
  submitted: number;
  missing: number;
  totalParticipants: number;
  messagesToday: number;
}

export function DashboardPage() {
  const { activeHackathon } = useHackathonStore();
  const { teams } = useTeamsStore();
  const { setBroadcastOpen, setCreateHackathonOpen, setInviteOpen } = useUIStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!activeHackathon) return;
    setMetricsLoading(true);
    api
      .get<Metrics>(`/hackathons/${activeHackathon.id}/metrics`)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setMetricsLoading(false));

    const socket = getSocket();
    const handler = ({ payload }: any) => setMetrics(payload);
    socket.on('metrics:updated', handler);
    return () => { socket.off('metrics:updated', handler); };
  }, [activeHackathon?.id]);

  const recentCheckins = [...teams]
    .filter((t) => t.checkInTime)
    .sort((a, b) => new Date(b.checkInTime!).getTime() - new Date(a.checkInTime!).getTime())
    .slice(0, 6);

  if (!activeHackathon) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        >
          <Zap className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
        </div>
        <h2 className="text-heading mb-2">No hackathon selected</h2>
        <p className="text-caption text-center mb-8">Create your first event workspace to get started.</p>
        {isAdmin && (
          <button className="btn btn-primary btn-lg" onClick={() => setCreateHackathonOpen(true)}>
            <Zap className="w-4 h-4" />
            Create hackathon
          </button>
        )}
      </div>
    );
  }

  const statusColor =
    activeHackathon.status === 'ACTIVE'
      ? 'var(--green)'
      : activeHackathon.status === 'ENDED'
      ? 'var(--text-muted)'
      : 'var(--yellow)';

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">

      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-heading flex-1 min-w-0 truncate">{activeHackathon.name}</h1>
          <div
            className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1 rounded-full"
            style={{
              background: activeHackathon.status === 'ACTIVE' ? 'var(--green-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${activeHackathon.status === 'ACTIVE' ? 'rgba(5,150,105,0.2)' : 'var(--border-strong)'}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: statusColor,
              }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: statusColor, fontSize: 10 }}
            >
              {activeHackathon.status}
            </span>
          </div>
        </div>
        <p className="text-caption">
          {formatDate(activeHackathon.startDate)} → {formatDate(activeHackathon.endDate)}
          {activeHackathon.venue && <> · {activeHackathon.venue}</>}
        </p>
      </div>

      {/* Primary stat — big check-in */}
      <div className="card mb-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-label mb-1">Check-in progress</p>
            {metricsLoading ? (
              <div className="skeleton w-20 h-10 rounded-lg" />
            ) : (
              <span className="metric-num" style={{ color: 'var(--accent)' }}>
                {metrics?.checkedInPercent ?? 0}%
              </span>
            )}
          </div>
          {!metricsLoading && metrics && (
            <div className="text-right">
              <p className="text-label mb-1">Teams</p>
              <p className="metric-num-sm" style={{ color: 'var(--text)' }}>
                {metrics.checkedIn}
                <span style={{ fontSize: '0.6em', color: 'var(--text-muted)', fontWeight: 400 }}>
                  /{metrics.totalTeams}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="progress-track mb-5">
          <div
            className="progress-fill progress-fill-accent"
            style={{ width: `${metrics?.checkedInPercent ?? 0}%` }}
          />
        </div>

        {/* Stats row */}
        {metricsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Total', value: metrics.totalTeams, color: 'var(--text)' },
              { label: 'In', value: metrics.checkedIn, color: 'var(--green)' },
              { label: 'Active', value: metrics.active, color: 'var(--yellow)' },
              { label: 'Done', value: metrics.submitted, color: 'var(--blue)' },
            ].map((s) => (
              <div
                key={s.label}
                className="text-center py-2 px-1 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <p
                  className="font-display font-bold"
                  style={{ fontSize: 22, color: s.color, letterSpacing: '-0.03em' }}
                >
                  {s.value}
                </p>
                <p className="text-caption mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Participants & Messages */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
              style={{ background: 'var(--blue-dim)' }}
            >
              <Users className="w-4 h-4" style={{ color: 'var(--blue)' }} />
            </div>
            <p className="metric-num-sm" style={{ color: 'var(--blue)' }}>
              {metrics.totalParticipants}
            </p>
            <p className="text-caption mt-1">Participants</p>
          </div>
          <div className="card p-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
              style={{ background: 'var(--accent-dim)' }}
            >
              <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="metric-num-sm" style={{ color: 'var(--accent)' }}>
              {metrics.missing}
            </p>
            <p className="text-caption mt-1">Not checked in</p>
          </div>
        </div>
      )}

      {/* Action grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => navigate('/checkin')}
          className="card-hover p-5 text-left"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
            style={{ background: 'var(--green-dim)', border: '1px solid rgba(5,150,105,0.15)' }}
          >
            <UserCheck className="w-5 h-5" style={{ color: 'var(--green)' }} />
          </div>
          <p className="text-title" style={{ marginBottom: 4 }}>Check-in</p>
          <p className="text-caption">{metrics?.missing ?? '–'} waiting</p>
        </button>

        <button
          onClick={() => navigate('/teams')}
          className="card-hover p-5 text-left"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
            style={{ background: 'var(--blue-dim)', border: '1px solid rgba(37,99,235,0.15)' }}
          >
            <Users className="w-5 h-5" style={{ color: 'var(--blue)' }} />
          </div>
          <p className="text-title" style={{ marginBottom: 4 }}>Teams</p>
          <p className="text-caption">{metrics?.totalTeams ?? '–'} registered</p>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => setBroadcastOpen(true)}
              className="card-hover p-5 text-left"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'var(--orange-dim)', border: '1px solid rgba(217,119,6,0.15)' }}
              >
                <Send className="w-5 h-5" style={{ color: 'var(--orange)' }} />
              </div>
              <p className="text-title" style={{ marginBottom: 4 }}>Broadcast</p>
              <p className="text-caption">{metrics?.messagesToday ?? 0} today</p>
            </button>

            <button
              onClick={() => setInviteOpen(true)}
              className="card-hover p-5 text-left"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'var(--accent-dim)', border: '1px solid rgba(79,70,229,0.15)' }}
              >
                <Link2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-title" style={{ marginBottom: 4 }}>Invite</p>
              <p className="text-caption">Add coordinators</p>
            </button>

            <button
              onClick={() => setCreateHackathonOpen(true)}
              className="card-hover p-5 text-left col-span-2"
              style={{ border: '1px dashed var(--border-strong)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
                >
                  <Zap className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                </div>
                <div>
                  <p className="text-title" style={{ marginBottom: 2 }}>New hackathon</p>
                  <p className="text-caption">Create another event workspace</p>
                </div>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Recent check-ins */}
      {recentCheckins.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <p className="text-label">Recent check-ins</p>
            </div>
            <button
              onClick={() => navigate('/teams')}
              className="flex items-center gap-1 text-caption press"
              style={{ color: 'var(--text-secondary)' }}
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="card overflow-hidden">
            {recentCheckins.map((team, i) => (
              <button
                key={team.id}
                onClick={() => navigate('/teams')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-100 border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  className="avatar avatar-sm flex-shrink-0 font-display"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  {team.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ fontSize: 14 }}>{team.name}</p>
                  <p className="text-caption">{pluralize(team.participants.length, 'member')}</p>
                </div>
                <span className={cn('badge', `badge-${team.status.toLowerCase()}`)}>
                  {team.status.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
