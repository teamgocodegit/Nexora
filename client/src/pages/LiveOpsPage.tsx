import { useEffect, useState } from 'react';
import { useHackathonStore } from '@/store/hackathonStore';
import { api } from '@/lib/api';
import { Radio, Users, DoorOpen, UserCheck, Clock, Activity, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegistrationStats {
  total: number;
  pending: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
  capacity: number;
}

interface DashboardSnapshot {
  registrations: RegistrationStats;
  teamCount: number;
  roomCount: number;
  checkedInTeams: number;
  recentActivity: Array<{
    id: string;
    action: string;
    createdAt: string;
  }>;
}

export function LiveOpsPage() {
  const { activeHackathon } = useHackathonStore();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeHackathon) { setLoading(false); return; }
    const fetch = async () => {
      try {
        const [stats, teams, rooms, activity, checkin] = await Promise.all([
          api.get<RegistrationStats>(`/hackathons/${activeHackathon.id}/registrations/stats`)
            .catch(() => null),
          api.get<any[]>(`/hackathons/${activeHackathon.id}/teams`).catch(() => []),
          api.get<any[]>(`/hackathons/${activeHackathon.id}/rooms`).catch(() => []),
          api.get<any[]>(`/hackathons/${activeHackathon.id}/activity`).catch(() => []),
          api.get<any[]>(`/hackathons/${activeHackathon.id}/teams/checked-in`).catch(() => []),
        ]);
        setSnapshot({
          registrations: stats || { total: 0, pending: 0, accepted: 0, waitlisted: 0, rejected: 0, capacity: 0 },
          teamCount: teams.length,
          roomCount: rooms.length,
          checkedInTeams: checkin.length,
          recentActivity: (activity || []).slice(0, 10).map((a: any) => ({ id: a.id, action: a.action, createdAt: a.createdAt })),
        });
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [activeHackathon]);

  if (!activeHackathon) {
    return (
      <div className="empty-state">
        <Radio className="w-5 h-5 empty-icon" style={{ color: 'var(--text-muted)' }} />
        <p className="text-title mb-2">No hackathon selected</p>
        <p className="text-caption">Select a hackathon to view operations.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
        <div className="skeleton h-8 w-48 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const reg = snapshot?.registrations;
  const acceptedPct = reg && reg.capacity ? Math.min(100, (reg.accepted / reg.capacity) * 100) : 0;
  const checkinPct = snapshot?.teamCount ? Math.round(((snapshot.checkedInTeams || 0) / snapshot.teamCount) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="mb-6">
        <h1 className="text-heading">Live Operations</h1>
        <p className="text-caption mt-0.5">{activeHackathon.name}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard
          icon={<Users className="w-4 h-4" />}
          label="Teams"
          value={snapshot?.teamCount ?? 0}
          color="var(--accent)"
        />
        <MetricCard
          icon={<UserCheck className="w-4 h-4" />}
          label="Checked in"
          value={`${snapshot?.checkedInTeams ?? 0} (${checkinPct}%)`}
          color="var(--green)"
        />
        <MetricCard
          icon={<DoorOpen className="w-4 h-4" />}
          label="Rooms"
          value={snapshot?.roomCount ?? 0}
          color="var(--purple)"
        />
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="Pending reg."
          value={reg?.pending ?? 0}
          color="var(--yellow)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Registration progress */}
        <div className="card p-4">
          <h3 className="text-label mb-3">Registration Progress</h3>
          {reg && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-caption">Accepted</p>
                <p className="font-semibold" style={{ fontSize: 14 }}>{reg.accepted} / {reg.capacity}</p>
              </div>
              <div className="progress-track mb-3">
                <div className="progress-fill progress-fill-accent" style={{ width: `${acceptedPct}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span className="text-caption">Pending: {reg.pending}</span>
                <span className="text-caption">Waitlisted: {reg.waitlisted}</span>
                <span className="text-caption">Rejected: {reg.rejected}</span>
                <span className="text-caption">Total: {reg.total}</span>
              </div>
            </>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-4">
          <h3 className="text-label mb-3">Recent Activity</h3>
          {snapshot?.recentActivity && snapshot.recentActivity.length > 0 ? (
            <div className="space-y-2">
              {snapshot.recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 py-1">
                  <Activity className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{a.action}</p>
                  <span className="text-caption flex-shrink-0">
                    {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-caption">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-display font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
        {value}
      </p>
      <p className="text-caption mt-0.5">{label}</p>
    </div>
  );
}
