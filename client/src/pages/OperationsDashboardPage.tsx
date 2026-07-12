import { useEffect, useState } from 'react';
import { useHackathonStore } from '@/store/hackathonStore';
import { api } from '@/lib/api';
import { Users, DoorOpen, UserCheck, AlertTriangle, ClipboardList, Move, Activity } from 'lucide-react';

interface OpsMetrics {
  totalTeams: number;
  checkedIn: number;
  notArrived: number;
  assigned: number;
  unassigned: number;
  totalParticipants: number;
  activeRooms: number;
  fullRooms: number;
  closedRooms: number;
  nearlyFullRooms: number;
  capacityOverrides: number;
  checkedInNoRoom: number;
}

interface RoomCard {
  id: string;
  name: string;
  code: string | null;
  building: string | null;
  floor: string | null;
  status: string;
  capacityTeams: number | null;
  capacityPeople: number | null;
  currentTeams: number;
  currentPeople: number;
  remainingTeamCapacity: number | null;
  remainingPeopleCapacity: number | null;
  sortOrder: number;
}

interface ExceptionItem {
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  explanation: string;
  suggestedAction: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: 'var(--green-dim)', color: 'var(--green)' },
  FULL: { bg: 'var(--red-dim)', color: 'var(--red)' },
  CLOSED: { bg: 'var(--bg-muted)', color: 'var(--text-muted)' },
  ARCHIVED: { bg: 'var(--bg-muted)', color: 'var(--text-muted)' },
};

export function OperationsDashboardPage() {
  const { activeHackathon } = useHackathonStore();
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'dashboard' | 'exceptions'>('dashboard');

  useEffect(() => {
    if (!activeHackathon) { setLoading(false); return; }
    const fetch = async () => {
      try {
        const [m, r, e] = await Promise.all([
          api.get<OpsMetrics>(`/hackathons/${activeHackathon.id}/operations/dashboard`).catch(() => null),
          api.get<RoomCard[]>(`/hackathons/${activeHackathon.id}/operations/rooms`).catch(() => []),
          api.get<ExceptionItem[]>(`/hackathons/${activeHackathon.id}/operations/exceptions`).catch(() => []),
        ]);
        setMetrics(m);
        setRooms(r);
        setExceptions(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [activeHackathon?.id]);

  if (!activeHackathon) {
    return <div className="empty-state"><p className="text-title">No hackathon selected</p></div>;
  }

  const criticalCount = exceptions.filter(e => e.type === 'CRITICAL').length;
  const warningCount = exceptions.filter(e => e.type === 'WARNING').length;

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-heading">Venue Operations</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('dashboard')}
            className={`btn btn-sm ${tab === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Activity className="w-3.5 h-3.5" /> Dashboard
          </button>
          <button
            onClick={() => setTab('exceptions')}
            className={`btn btn-sm ${tab === 'exceptions' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Exceptions
            {(criticalCount + warningCount) > 0 && (
              <span className="badge" style={{ background: criticalCount > 0 ? 'var(--red-dim)' : 'var(--yellow-dim)', color: criticalCount > 0 ? 'var(--red)' : 'var(--yellow)', marginLeft: 4 }}>{criticalCount + warningCount}</span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : tab === 'dashboard' ? (
        <>
          {/* Summary cards */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="card p-3"><p className="text-caption">Total Teams</p><p className="text-2xl font-bold">{metrics.totalTeams}</p></div>
              <div className="card p-3"><p className="text-caption">Checked In</p><p className="text-2xl font-bold" style={{ color: 'var(--green)' }}>{metrics.checkedIn}</p></div>
              <div className="card p-3"><p className="text-caption">Not Arrived</p><p className="text-2xl font-bold" style={{ color: metrics.notArrived > 0 ? 'var(--yellow)' : 'var(--green)' }}>{metrics.notArrived}</p></div>
              <div className="card p-3"><p className="text-caption">Participants</p><p className="text-2xl font-bold">{metrics.totalParticipants}</p></div>
              <div className="card p-3"><p className="text-caption">Assigned</p><p className="text-lg font-bold">{metrics.assigned}</p></div>
              <div className="card p-3"><p className="text-caption">Unassigned</p><p className="text-lg font-bold" style={{ color: metrics.unassigned > 0 ? 'var(--yellow)' : 'var(--green)' }}>{metrics.unassigned}</p></div>
              <div className="card p-3"><p className="text-caption">Active Rooms</p><p className="text-lg font-bold">{metrics.activeRooms}</p></div>
              <div className="card p-3"><p className="text-caption">Full Rooms</p><p className="text-lg font-bold" style={{ color: 'var(--red)' }}>{metrics.fullRooms}</p></div>
              <div className="card p-3"><p className="text-caption">Closed Rooms</p><p className="text-lg font-bold">{metrics.closedRooms}</p></div>
              <div className="card p-3"><p className="text-caption">Near Full</p><p className="text-lg font-bold" style={{ color: metrics.nearlyFullRooms > 0 ? 'var(--yellow)' : 'var(--green)' }}>{metrics.nearlyFullRooms}</p></div>
              <div className="card p-3"><p className="text-caption">Overrides</p><p className="text-lg font-bold">{metrics.capacityOverrides}</p></div>
              <div className="card p-3" style={{ borderColor: metrics.checkedInNoRoom > 0 ? 'var(--red)' : undefined }}>
                <p className="text-caption">Checked In / No Room</p>
                <p className="text-lg font-bold" style={{ color: metrics.checkedInNoRoom > 0 ? 'var(--red)' : 'var(--green)' }}>{metrics.checkedInNoRoom}</p>
              </div>
            </div>
          )}

          {/* Room cards */}
          <h2 className="font-semibold mb-3" style={{ fontSize: 15 }}>Rooms</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rooms.map(room => {
              const st = STATUS_STYLES[room.status] || STATUS_STYLES.ACTIVE;
              const teamCapPct = room.capacityTeams ? Math.round((room.currentTeams / room.capacityTeams) * 100) : null;
              const peopleCapPct = room.capacityPeople ? Math.round((room.currentPeople / room.capacityPeople) * 100) : null;
              const maxPct = Math.max(teamCapPct || 0, peopleCapPct || 0);
              return (
                <div key={room.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold" style={{ fontSize: 14 }}>{room.name}{room.code ? ` (${room.code})` : ''}</p>
                      <p className="text-caption">{[room.building, room.floor].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <span className="badge" style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}25` }}>{room.status}</span>
                  </div>
                  <div className="progress-track mb-1">
                    <div className="progress-fill" style={{ width: `${maxPct}%`, background: room.status === 'FULL' ? 'var(--red)' : maxPct >= 80 ? 'var(--yellow)' : 'var(--accent)' }} />
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{room.currentTeams}{room.capacityTeams ? `/${room.capacityTeams}` : ''} teams</span>
                    <span>{room.currentPeople}{room.capacityPeople ? `/${room.capacityPeople}` : ''} people</span>
                    <span>{room.remainingTeamCapacity !== null ? `${room.remainingTeamCapacity} seats` : '—'}</span>
                  </div>
                </div>
              );
            })}
            {rooms.length === 0 && <p className="text-caption col-span-full">No rooms found</p>}
          </div>
        </>
      ) : (
        <>
          {/* Exceptions tab */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-semibold">{exceptions.length} issues</span>
            <span className="text-sm" style={{ color: 'var(--red)' }}>{criticalCount} critical</span>
            <span className="text-sm" style={{ color: 'var(--yellow)' }}>{warningCount} warnings</span>
          </div>
          {exceptions.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="font-semibold mb-1">All clear</p>
              <p className="text-caption">No operational issues detected.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exceptions.map((ex, i) => (
                <div key={i} className="card p-4" style={{ borderLeft: `3px solid ${ex.type === 'CRITICAL' ? 'var(--red)' : ex.type === 'WARNING' ? 'var(--yellow)' : 'var(--accent)'}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge" style={{
                      background: ex.type === 'CRITICAL' ? 'var(--red-dim)' : ex.type === 'WARNING' ? 'var(--yellow-dim)' : 'var(--accent-dim)',
                      color: ex.type === 'CRITICAL' ? 'var(--red)' : ex.type === 'WARNING' ? 'var(--yellow)' : 'var(--accent)',
                    }}>{ex.type}</span>
                    <span className="badge">{ex.category}</span>
                    <span className="text-caption">{ex.entityType}: {ex.entityName || ex.entityId}</span>
                  </div>
                  <p className="text-sm">{ex.explanation}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>→ {ex.suggestedAction}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
