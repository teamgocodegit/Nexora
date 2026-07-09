import { useEffect, useState, useMemo } from 'react';
import { Phone, UserCheck, RefreshCw, LogOut, Zap, Users, Search, QrCode, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTeamsStore, Team } from '@/store/teamsStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { disconnectSocket } from '@/lib/socket';
import { useNavigate } from 'react-router-dom';
import { cn, initials, pluralize } from '@/lib/utils';

export function CoordinatorView() {
  const { user, logout } = useAuthStore();
  const { teams, fetchTeams, checkIn } = useTeamsStore();
  const { activeHackathon, fetchHackathons } = useHackathonStore();
  const { toast } = useUIStore();
  const navigate = useNavigate();
  const [checking, setChecking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showQrScanner, setShowQrScanner] = useState(false);

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.room?.toLowerCase().includes(q) ||
        t.teamId?.toLowerCase().includes(q) ||
        t.participants.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [teams, search]);

  useEffect(() => {
    fetchHackathons().then(() => {
      if (activeHackathon) fetchTeams(activeHackathon.id);
    });
  }, []);

  const handleCheckIn = async (team: Team) => {
    if (!activeHackathon) return;
    setChecking(team.id);
    try {
      await checkIn(activeHackathon.id, team.id);
      toast(`${team.name} checked in ✓`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setChecking(null);
    }
  };

  const statusColors: Record<string, string> = {
    REGISTERED: 'var(--border-accent)',
    CHECKED_IN: 'var(--green)',
    ACTIVE: 'var(--yellow)',
    SUBMITTED: 'var(--blue)',
    DISQUALIFIED: 'var(--red)',
  };

  const checkedCount = teams.filter((t) =>
    ['CHECKED_IN', 'ACTIVE', 'SUBMITTED'].includes(t.status)
  ).length;

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <header
        className="pt-safe"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--text)' }}
            >
              <Zap className="w-5 h-5" style={{ color: 'var(--bg)' }} strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-display font-bold" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>
                Nexora
              </p>
              <p className="text-caption">
                {user?.name} · Sub Admin
              </p>
            </div>
          </div>
          <button
            onClick={() => { logout(); disconnectSocket(); navigate('/auth'); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--red)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
          >
            <LogOut className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Event info */}
        {activeHackathon && (
          <div className="px-4 pb-4">
            <div
              className="px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <p className="text-caption mb-0.5">Current event</p>
              <p
                className="font-display font-bold"
                style={{ fontSize: 16, letterSpacing: '-0.02em' }}
              >
                {activeHackathon.name}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Search + stats bar */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="input w-full"
            style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => setShowQrScanner(true)}
          className="btn btn-ghost btn-icon btn-sm"
          title="Scan QR code"
        >
          <QrCode className="w-4 h-4" />
        </button>
        <button
          onClick={() => { if (activeHackathon) fetchTeams(activeHackathon.id); }}
          className="btn btn-ghost btn-icon btn-sm"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {teams.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }}
            />
            <p className="text-caption">
              {checkedCount}/{teams.length} checked in
            </p>
          </div>
          <p className="text-caption ml-auto">{filteredTeams.length} showing</p>
        </div>
      )}

      {/* Teams list */}
      <div className="px-4 pt-4 pb-24 space-y-3">
        <p className="text-label mb-1">
          {search.trim() ? 'Results' : 'Assigned Teams'} ({filteredTeams.length})
        </p>

        {filteredTeams.length === 0 ? (
          <div className="empty-state mt-8">
            <div className="empty-icon">
              <Users className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-caption">
              {search.trim() ? 'No teams match your search' : 'No teams assigned to you yet'}
            </p>
          </div>
        ) : (
          filteredTeams.map((team) => (
            <div
              key={team.id}
              className="card p-4"
            >
              {/* Team header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold flex-shrink-0"
                  style={{ fontSize: 15, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
                >
                  {initials(team.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-display font-bold"
                    style={{ fontSize: 16, letterSpacing: '-0.02em' }}
                  >
                    {team.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: statusColors[team.status] || 'var(--border-accent)',
                        boxShadow: team.status === 'CHECKED_IN'
                          ? '0 0 6px var(--green)'
                          : 'none',
                      }}
                    />
                    <span className={cn('badge', `badge-${team.status.toLowerCase()}`)}>
                      {team.status.replace('_', ' ')}
                    </span>
                    {team.room && (
                      <span className="text-caption font-mono">{team.room}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Members preview */}
              {team.participants.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex -space-x-1.5">
                    {team.participants.slice(0, 5).map((p) => (
                      <div
                        key={p.id}
                        className="w-6 h-6 rounded-full border flex items-center justify-center"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1.5px solid var(--bg-card)',
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                          fontFamily: 'Syne, sans-serif',
                        }}
                        title={p.name}
                      >
                        {p.name[0]}
                      </div>
                    ))}
                  </div>
                  <p className="text-caption">
                    {pluralize(team.participants.length, 'member')}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                {team.status === 'REGISTERED' && (
                  <button
                    onClick={() => handleCheckIn(team)}
                    disabled={checking === team.id}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl disabled:opacity-50 transition-colors"
                    style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,232,122,0.2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,232,122,0.18)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--green-dim)')}
                  >
                    {checking === team.id ? (
                      <div className="spinner-green" style={{ width: 20, height: 20 }} />
                    ) : (
                      <UserCheck className="w-5 h-5" style={{ color: 'var(--green)' }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', fontFamily: 'DM Sans, sans-serif' }}>
                      Check In
                    </span>
                  </button>
                )}

                {team.leaderPhone && (
                  <a
                    href={`tel:${team.leaderPhone}`}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  >
                    <Phone className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'DM Sans, sans-serif' }}>
                      Call
                    </span>
                  </a>
                )}

                {team.leaderPhone && (
                  <a
                    href={`https://wa.me/${team.leaderPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors"
                    style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', textDecoration: 'none' }}
                  >
                    <Phone className="w-5 h-5" style={{ color: '#25D366' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#25D366', fontFamily: 'DM Sans, sans-serif' }}>
                      WhatsApp
                    </span>
                  </a>
                )}
              </div>

              {/* Project name if any */}
              {team.projectName && (
                <p
                  className="text-caption mt-3 px-3 py-2 rounded-lg truncate"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  {team.projectName}
                </p>
              )}
            </div>
          ))
        )}
      </div>
      {/* QR Scanner modal */}
      {showQrScanner && (
        <>
          <div className="overlay animate-fade-in" onClick={() => setShowQrScanner(false)} />
          <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <QrCode className="w-4.5 h-4.5" style={{ color: 'var(--accent)', width: 18, height: 18 }} />
                </div>
                <div>
                  <h2 className="font-semibold" style={{ fontSize: 16 }}>Scan QR Code</h2>
                  <p className="text-caption">Point camera at team QR code to check in</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowQrScanner(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <QrCode className="w-16 h-16 mb-4" style={{ color: 'var(--text-muted)' }} />
              <p className="text-caption text-center max-w-xs">
                Camera access will be requested. Point at a team's QR token or enter their team ID manually below.
              </p>
              <div className="flex gap-2 w-full mt-4">
                <input
                  placeholder="Enter team ID (e.g. NEX-ABC-001)"
                  className="input flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget.value.trim();
                      const team = teams.find((t) => t.teamId?.toLowerCase() === input.toLowerCase());
                      if (team) {
                        handleCheckIn(team);
                        setShowQrScanner(false);
                      } else {
                        toast('Team not found', 'error');
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
