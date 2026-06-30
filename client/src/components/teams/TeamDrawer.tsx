import { useState, useEffect } from 'react';
import { X, Phone, UserCheck, RotateCcw, MessageSquare, Edit2, Check, MapPin, Trash2 } from 'lucide-react';
import { Team, TeamStatus, useTeamsStore } from '@/store/teamsStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { cn, formatDateTime, initials } from '@/lib/utils';

const STATUS_ACTIONS: { from: TeamStatus[]; to: TeamStatus; label: string; style: 'green' | 'default' | 'ghost' }[] = [
  { from: ['REGISTERED'], to: 'CHECKED_IN', label: 'Check in', style: 'green' },
  { from: ['CHECKED_IN'], to: 'ACTIVE', label: 'Mark active', style: 'default' },
  { from: ['ACTIVE'], to: 'SUBMITTED', label: 'Mark submitted', style: 'default' },
  { from: ['CHECKED_IN', 'ACTIVE', 'SUBMITTED'], to: 'REGISTERED', label: 'Undo', style: 'ghost' },
];

export function TeamDrawer({ team, onClose }: { team: Team; onClose: () => void }) {
  const { activeHackathon } = useHackathonStore();
  const { updateTeam, checkIn, deleteTeam } = useTeamsStore();
  const { toast, setBroadcastOpen } = useUIStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [coordinators, setCoordinators] = useState<any[]>([]);
  const [editingRoom, setEditingRoom] = useState(false);
  const [roomVal, setRoomVal] = useState(team.room ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!activeHackathon || !isAdmin) return;
    api.get<any[]>(`/hackathons/${activeHackathon.id}/coordinators`).then(setCoordinators).catch(() => {});
  }, [activeHackathon?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleStatus = async (to: TeamStatus) => {
    if (!activeHackathon) return;
    setSaving(true);
    try {
      if (to === 'CHECKED_IN') await checkIn(activeHackathon.id, team.id);
      else await updateTeam(activeHackathon.id, team.id, { status: to });
      toast(`Status → ${to.replace('_', ' ')}`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveRoom = async () => {
    if (!activeHackathon) return;
    await updateTeam(activeHackathon.id, team.id, { room: roomVal });
    setEditingRoom(false);
    toast('Room updated', 'success');
  };

  const handleDelete = async () => {
    if (!activeHackathon) return;
    try {
      await deleteTeam(activeHackathon.id, team.id);
      toast('Team deleted', 'success');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const actions = STATUS_ACTIONS.filter((a) => a.from.includes(team.status));

  return (
    <>
      <div className="overlay animate-fade-in" onClick={onClose} />
      <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 pb-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="avatar avatar-lg flex-shrink-0 font-display"
            style={{ fontWeight: 700, background: 'var(--bg-elevated)' }}
          >
            {initials(team.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="font-display font-bold truncate"
              style={{ fontSize: 17, letterSpacing: '-0.02em' }}
            >
              {team.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('badge', `badge-${team.status.toLowerCase()}`)}>
                {team.status.replace('_', ' ')}
              </span>
              {team.room && (
                <span className="text-caption font-mono">{team.room}</span>
              )}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm flex-shrink-0"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status actions */}
          {isAdmin && actions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {actions.map((a) => (
                <button
                  key={a.to}
                  onClick={() => handleStatus(a.to)}
                  disabled={saving}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl font-semibold transition-all',
                    'disabled:opacity-50'
                  )}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    fontSize: 13,
                    fontFamily: 'DM Sans, sans-serif',
                    ...(a.style === 'green'
                      ? {
                          background: 'var(--green-dim)',
                          color: 'var(--green)',
                          border: '1px solid rgba(0,232,122,0.25)',
                        }
                      : a.style === 'ghost'
                      ? {
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-strong)',
                        }
                      : {
                          background: 'var(--bg-elevated)',
                          color: 'var(--text)',
                          border: '1px solid var(--border-strong)',
                        }),
                  }}
                >
                  {a.to === 'CHECKED_IN' && <UserCheck className="w-3.5 h-3.5" />}
                  {a.to === 'REGISTERED' && <RotateCcw className="w-3.5 h-3.5" />}
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Members */}
          <div>
            <p className="text-label mb-3">
              Members ({team.participants.length})
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              {team.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                >
                  <div
                    className="avatar avatar-sm flex-shrink-0 font-display"
                    style={{
                      background: p.isLeader ? 'var(--text)' : 'var(--bg-elevated)',
                      color: p.isLeader ? 'var(--bg)' : 'var(--text-secondary)',
                    }}
                  >
                    {initials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate" style={{ fontSize: 14 }}>
                        {p.name}
                      </p>
                      {p.isLeader && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-bold uppercase"
                          style={{
                            fontSize: 9,
                            letterSpacing: '0.07em',
                            background: 'var(--text)',
                            color: 'var(--bg)',
                          }}
                        >
                          Leader
                        </span>
                      )}
                    </div>
                    {p.email && (
                      <p className="text-caption truncate mt-0.5">{p.email}</p>
                    )}
                  </div>
                  {p.phone && (
                    <a
                      href={`tel:${p.phone}`}
                      className="btn btn-ghost btn-icon btn-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
              {team.participants.length === 0 && (
                <p className="text-caption px-4 py-3">No members added</p>
              )}
            </div>
          </div>

          {/* Room */}
          <div>
            <p className="text-label mb-3">Room / Table</p>
            {editingRoom ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={roomVal}
                  onChange={(e) => setRoomVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRoom();
                    if (e.key === 'Escape') setEditingRoom(false);
                  }}
                  className="input flex-1 font-mono"
                  placeholder="e.g. A-101"
                />
                <button className="btn btn-green btn-icon" onClick={saveRoom}>
                  <Check className="w-4 h-4" />
                </button>
                <button className="btn btn-secondary btn-icon" onClick={() => setEditingRoom(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => isAdmin && setEditingRoom(true)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (isAdmin) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="font-mono" style={{ fontSize: 14, color: team.room ? 'var(--text)' : 'var(--text-muted)' }}>
                    {team.room || 'Not assigned'}
                  </span>
                </div>
                {isAdmin && <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
              </button>
            )}
          </div>

          {/* Coordinator */}
          {isAdmin && (
            <div>
              <p className="text-label mb-3">Assigned coordinator</p>
              <select
                value={team.coordinator?.id ?? ''}
                onChange={(e) =>
                  updateTeam(activeHackathon!.id, team.id, {
                    coordinatorId: e.target.value || undefined,
                  })
                }
                className="input"
              >
                <option value="">Unassigned</option>
                {coordinators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Timeline */}
          {team.checkInTime && (
            <div>
              <p className="text-label mb-3">Timeline</p>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                <div
                  className="flex justify-between items-center px-4 py-3 border-b last:border-0"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                >
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Checked in</span>
                  <span className="font-mono text-caption">{formatDateTime(team.checkInTime)}</span>
                </div>
                {team.submissionTime && (
                  <div
                    className="flex justify-between items-center px-4 py-3"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Submitted</span>
                    <span className="font-mono text-caption">{formatDateTime(team.submissionTime)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delete */}
          {isAdmin && (
            <div className="pt-2">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="btn btn-danger w-full"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete team
                </button>
              ) : (
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: 'var(--red-dim)',
                    border: '1px solid rgba(248,113,113,0.2)',
                  }}
                >
                  <p
                    className="font-semibold mb-3"
                    style={{ fontSize: 14, color: 'var(--red)' }}
                  >
                    Delete "{team.name}"? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleDelete} className="btn btn-danger flex-1">
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="btn btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {isAdmin && team.leaderPhone && (
          <div
            className="flex gap-3 px-5 py-4 border-t"
            style={{
              borderColor: 'var(--border)',
              paddingBottom: 'calc(16px + var(--safe-bottom))',
            }}
          >
            <button
              onClick={() => { setBroadcastOpen(true); onClose(); }}
              className="btn btn-secondary flex-1"
            >
              <MessageSquare className="w-4 h-4" /> Message
            </button>
            <a
              href={`https://wa.me/${team.leaderPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener"
              className="btn flex-1 font-semibold text-white"
              style={{ background: '#25D366', textDecoration: 'none' }}
            >
              <Phone className="w-4 h-4" /> WhatsApp
            </a>
          </div>
        )}
      </div>
    </>
  );
}
