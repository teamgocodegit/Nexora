import { useEffect, useState, useCallback } from 'react';
import { Search, X, CheckCircle2, Clock, AlertCircle, UserCheck, Users, Loader2 } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { cn, formatDateTime } from '@/lib/utils';

interface Registration {
  id: string;
  registrationId: string;
  status: 'PENDING_APPROVAL' | 'ACCEPTED' | 'WAITLISTED' | 'REJECTED';
  teamName: string;
  college?: string;
  city?: string;
  leaderName: string;
  leaderEmail: string;
  leaderPhone?: string;
  memberData?: { members: Array<{ name: string; email: string; phone?: string }> };
  gitHubUrl?: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  dietary?: string;
  accessibility?: string;
  createdAt: string;
}

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
  capacity: number | null;
  acceptedTeams: number;
}

type TabType = 'ALL' | 'PENDING_APPROVAL' | 'ACCEPTED' | 'WAITLISTED' | 'REJECTED';

const TABS: { label: string; value: TabType }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Waitlisted', value: 'WAITLISTED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING_APPROVAL: 'var(--yellow)',
  ACCEPTED: 'var(--green)',
  WAITLISTED: 'var(--orange)',
  REJECTED: 'var(--red)',
};

export function RegistrationsPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabType>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      const [regs, s] = await Promise.all([
        api.get<Registration[]>(`/hackathons/${activeHackathon.id}/registrations?status=${tab}&search=${search}`),
        api.get<Stats>(`/hackathons/${activeHackathon.id}/registrations/stats`),
      ]);
      setRegistrations(regs);
      setStats(s);
    } catch {} finally {
      setLoading(false);
    }
  }, [activeHackathon?.id, tab, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (id: string, status: string) => {
    if (!activeHackathon) return;
    setProcessing(true);
    try {
      await api.patch(`/hackathons/${activeHackathon.id}/registrations/${id}/status`, { status });
      toast(`Status updated`, 'success');
      fetchData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const bulkUpdate = async (status: string) => {
    if (!activeHackathon || selected.size === 0) return;
    setProcessing(true);
    try {
      await api.post(`/hackathons/${activeHackathon.id}/registrations/bulk-status`, {
        ids: Array.from(selected),
        status,
      });
      toast(`${selected.size} registrations updated`, 'success');
      setSelected(new Set());
      fetchData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === registrations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(registrations.map((r) => r.id)));
    }
  };

  if (!activeHackathon) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Users className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
        <p className="text-title mb-2">No hackathon selected</p>
        <p className="text-caption">Select a hackathon to manage registrations.</p>
      </div>
    );
  }

  const capText = stats?.capacity
    ? `${stats.acceptedTeams} / ${stats.capacity} teams accepted`
    : `${stats?.acceptedTeams ?? 0} teams accepted`;

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-heading">Registrations</h1>
          <p className="text-caption mt-0.5">Review and manage team registrations</p>
        </div>
      </div>

      {/* Capacity + Stats */}
      {stats && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label">{capText}</p>
            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>{stats.total} total</span>
              <span style={{ color: 'var(--yellow)' }}>{stats.pending} pending</span>
              <span style={{ color: 'var(--green)' }}>{stats.accepted} accepted</span>
              <span style={{ color: 'var(--orange)' }}>{stats.waitlisted} waitlisted</span>
              <span style={{ color: 'var(--red)' }}>{stats.rejected} rejected</span>
            </div>
          </div>
          {stats.capacity && (
            <div className="progress-track">
              <div
                className="progress-fill progress-fill-accent"
                style={{ width: `${Math.min(100, (stats.acceptedTeams / stats.capacity) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Search + Tabs */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-disabled)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or leaders…"
            className="input pl-10"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setTab(t.value); setSelected(new Set()); }}
            className={cn('filter-chip', tab === t.value && 'active')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: 'var(--accent-dim)', border: '1px solid rgba(79,70,229,0.15)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => bulkUpdate('ACCEPTED')} disabled={processing} className="btn btn-sm" style={{ background: 'var(--green)', color: '#FFFFFF' }}>
            Accept
          </button>
          <button onClick={() => bulkUpdate('WAITLISTED')} disabled={processing} className="btn btn-secondary btn-sm">
            Waitlist
          </button>
          <button onClick={() => bulkUpdate('REJECTED')} disabled={processing} className="btn btn-danger btn-sm">
            Reject
          </button>
          <button onClick={() => setSelected(new Set())} className="btn btn-ghost btn-sm">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Registrations list */}
      {loading ? (
        <div className="card overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <div className="skeleton w-4 h-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-48 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Users className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No registrations found</p>
          <p className="text-caption">
            {tab === 'ALL'
              ? 'Share your registration link to start receiving team registrations.'
              : 'No registrations match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Header row (desktop) */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            <button onClick={toggleAll} className="w-4 h-4 flex-shrink-0" style={{ accentColor: 'var(--accent)' }}>
              <input type="checkbox" checked={selected.size === registrations.length && registrations.length > 0} readOnly className="w-4 h-4" />
            </button>
            <div className="text-label flex-1">Team</div>
            <div className="text-label" style={{ width: 120 }}>Leader</div>
            <div className="text-label" style={{ width: 100 }}>Status</div>
            <div className="text-label" style={{ width: 80 }}>Date</div>
            <div style={{ width: 80 }} />
          </div>

          {registrations.map((reg) => {
            const isExpanded = expanded === reg.id;
            return (
              <div key={reg.id}>
                <div
                  className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0 transition-colors duration-100"
                  style={{ borderColor: 'var(--border)', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : reg.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(reg.id)}
                      onChange={() => toggleSelect(reg.id)}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ fontSize: 14 }}>{reg.teamName}</p>
                    <p className="text-caption truncate">{reg.college || '—'}</p>
                  </div>
                  <div className="hidden md:block" style={{ width: 120 }}>
                    <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{reg.leaderName}</p>
                    <p className="text-caption truncate">{reg.leaderEmail}</p>
                  </div>
                  <div style={{ width: 100 }}>
                    <span
                      className="badge"
                      style={{
                        background: `${STATUS_COLORS[reg.status]}15`,
                        color: STATUS_COLORS[reg.status],
                        border: `1px solid ${STATUS_COLORS[reg.status]}30`,
                      }}
                    >
                      {reg.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="hidden md:block" style={{ width: 80 }}>
                    <p className="text-caption">{formatDateTime(reg.createdAt)}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-1" style={{ width: 80 }} onClick={(e) => e.stopPropagation()}>
                    {reg.status === 'PENDING_APPROVAL' && (
                      <>
                        <button onClick={() => updateStatus(reg.id, 'ACCEPTED')} disabled={processing} className="btn btn-ghost btn-icon btn-sm" title="Accept">
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                        </button>
                        <button onClick={() => updateStatus(reg.id, 'REJECTED')} disabled={processing} className="btn btn-ghost btn-icon btn-sm" title="Reject">
                          <X className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-label mb-1">Contact</p>
                        <p className="text-sm">{reg.leaderName}</p>
                        <p className="text-caption">{reg.leaderEmail}</p>
                        {reg.leaderPhone && <p className="text-caption">{reg.leaderPhone}</p>}
                      </div>
                      <div>
                        <p className="text-label mb-1">Details</p>
                        <p className="text-caption">College: {reg.college || '—'}</p>
                        <p className="text-caption">City: {reg.city || '—'}</p>
                        {reg.dietary && <p className="text-caption">Dietary: {reg.dietary}</p>}
                      </div>
                    </div>

                    {reg.memberData?.members && reg.memberData.members.length > 0 && (
                      <div className="mb-4">
                        <p className="text-label mb-2">Members ({reg.memberData.members.length})</p>
                        {reg.memberData.members.map((m, idx) => (
                          <div key={idx} className="flex items-center gap-3 py-1.5">
                            <div className="avatar avatar-sm font-display" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                              {m.name[0]}
                            </div>
                            <div>
                              <p className="text-sm">{m.name}</p>
                              <p className="text-caption">{m.email}{m.phone ? ` · ${m.phone}` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mobile action buttons */}
                    <div className="flex md:hidden items-center gap-2 mt-3">
                      {reg.status === 'PENDING_APPROVAL' && (
                        <>
                          <button onClick={() => updateStatus(reg.id, 'ACCEPTED')} disabled={processing} className="btn btn-sm flex-1" style={{ background: 'var(--green)', color: '#FFFFFF' }}>
                            Accept
                          </button>
                          <button onClick={() => updateStatus(reg.id, 'WAITLISTED')} disabled={processing} className="btn btn-secondary btn-sm flex-1">
                            Waitlist
                          </button>
                          <button onClick={() => updateStatus(reg.id, 'REJECTED')} disabled={processing} className="btn btn-danger btn-sm flex-1">
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
