import type { TeamStatus } from '@/store/teamsStore';
import { useState, useEffect, useRef } from 'react';
import { Search, UserCheck, CheckCircle2, XCircle, QrCode, ScanLine } from 'lucide-react';
import { useTeamsStore, Team } from '@/store/teamsStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';

interface LogEntry {
  team: Team;
  success: boolean;
  msg: string;
  time: Date;
}

export function CheckInPage() {
  const { teams, checkIn } = useTeamsStore();
  const { activeHackathon } = useHackathonStore();
  const { toast } = useUIStore();
  const [query, setQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = query.trim()
    ? teams
        .filter(
          (t) =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.participants.some((p) =>
              p.name.toLowerCase().includes(query.toLowerCase())
            )
        )
        .slice(0, 6)
    : [];

  const doCheckIn = async (team: Team) => {
    if (!activeHackathon || processing) return;
    if (team.status !== 'REGISTERED') {
      setLog((l) =>
        [{ team, success: false, msg: `Already ${team.status.replace('_', ' ')}`, time: new Date() }, ...l].slice(0, 20)
      );
      setQuery('');
      return;
    }
    setProcessing(true);
    try {
      await checkIn(activeHackathon.id, team.id);
      setLog((l) =>
        [
          { team: { ...team, status: 'CHECKED_IN' as TeamStatus }, success: true, msg: 'Checked in!', time: new Date() },
          ...l,
        ].slice(0, 20)
      );
      toast(`✓ ${team.name}`, 'success');
    } catch (e: any) {
      setLog((l) =>
        [{ team, success: false, msg: e.message, time: new Date() }, ...l].slice(0, 20)
      );
      toast(e.message, 'error');
    } finally {
      setProcessing(false);
      setQuery('');
      inputRef.current?.focus();
    }
  };

  const checkedCount = teams.filter((t) =>
    ['CHECKED_IN', 'ACTIVE', 'SUBMITTED'].includes(t.status)
  ).length;
  const pct = teams.length ? Math.round((checkedCount / teams.length) * 100) : 0;

  return (
    <div className="max-w-lg mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading">Check-in</h1>
          <p className="text-caption mt-0.5">Scan or search to check in teams</p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: 'var(--green-dim)',
            border: '1px solid rgba(0,232,122,0.2)',
          }}
        >
          <ScanLine className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>QR ready</span>
        </div>
      </div>

      {/* Progress card */}
      <div
        className="card p-5 mb-5"
        style={{
          background: 'linear-gradient(135deg, #111111 0%, #141414 100%)',
          border: '1px solid var(--border-strong)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium" style={{ fontSize: 14 }}>Progress</p>
          <span
            className="font-display font-bold"
            style={{ fontSize: 28, color: 'var(--green)', letterSpacing: '-0.04em' }}
          >
            {pct}%
          </span>
        </div>
        <p className="text-caption mb-4">
          {checkedCount} of {teams.length} teams · {teams.length - checkedCount} remaining
        </p>
        <div className="progress-track">
          <div className="progress-fill progress-fill-green" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 pointer-events-none"
          style={{ color: 'var(--text-disabled)', width: 18, height: 18 }}
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' && matches.length === 1 && doCheckIn(matches[0])
          }
          placeholder="Team name, member, or scan QR…"
          className="input pl-12"
          style={{ height: 48, fontSize: 15 }}
          autoComplete="off"
          autoCorrect="off"
        />
      </div>

      {/* Matches */}
      {matches.length > 0 && (
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{ border: '1px solid var(--border)' }}
        >
          {matches.map((team) => (
            <button
              key={team.id}
              onClick={() => doCheckIn(team)}
              disabled={processing}
              className="w-full flex items-center gap-3 px-4 py-4 text-left border-b last:border-0 transition-colors duration-100 disabled:opacity-50"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-card)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-display font-bold flex-shrink-0"
                style={{ fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
              >
                {team.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ fontSize: 14 }}>{team.name}</p>
                <p className="text-caption">{team.participants.length} members</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('badge', `badge-${team.status.toLowerCase()}`)}>
                  {team.status.replace('_', ' ')}
                </span>
                {team.status === 'REGISTERED' && (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--green-dim)' }}
                  >
                    <UserCheck className="w-4 h-4" style={{ color: 'var(--green)' }} />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* QR hint */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 rounded-xl mb-5"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <QrCode className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        <p className="text-caption">
          USB QR scanners auto-type into the search box. Single match + Enter = instant check-in.
        </p>
      </div>

      {/* Activity log */}
      {log.length > 0 && (
        <div>
          <p className="text-label mb-3">Recent activity</p>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            {log.slice(0, 10).map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                style={{
                  borderColor: 'var(--border)',
                  background: i === 0 ? 'var(--bg-elevated)' : 'var(--bg-card)',
                }}
              >
                {entry.success ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ fontSize: 14 }}>
                    {entry.team.name}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: entry.success ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {entry.msg}
                  </p>
                </div>
                <span className="font-mono text-caption flex-shrink-0">
                  {entry.time.toLocaleTimeString('en', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
