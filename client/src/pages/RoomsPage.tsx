import { useEffect, useState } from 'react';
import { Plus, X, DoorOpen, Users, Building2 } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';


interface Room {
  id: string;
  name: string;
  code?: string;
  description?: string;
  building?: string;
  floor?: string;
  capacityTeams?: number;
  capacityPeople?: number;
  capacity: number;
  notes?: string;
  sortOrder: number;
  status: 'ACTIVE' | 'FULL' | 'CLOSED' | 'ARCHIVED';
  currentTeams: number;
  currentPeople: number;
  hackathonId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--green)', bg: 'var(--green-dim)' },
  FULL: { label: 'Full', color: 'var(--red)', bg: 'var(--red-dim)' },
  CLOSED: { label: 'Closed', color: 'var(--text-muted)', bg: 'var(--bg-muted)' },
  ARCHIVED: { label: 'Archived', color: 'var(--text-muted)', bg: 'var(--bg-muted)' },
};

export function RoomsPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '', description: '', building: '', floor: '', capacity: '30', capacityTeams: '', capacityPeople: '', notes: '' });
  const [creating, setCreating] = useState(false);

  const fetchRooms = async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      setRooms(await api.get<Room[]>(`/hackathons/${activeHackathon.id}/rooms`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, [activeHackathon?.id]);

  const createRoom = async () => {
    if (!activeHackathon || !createForm.name.trim()) return;
    setCreating(true);
    try {
      await api.post(`/hackathons/${activeHackathon.id}/rooms`, {
        name: createForm.name.trim(),
        code: createForm.code.trim() || undefined,
        description: createForm.description.trim() || undefined,
        building: createForm.building.trim() || undefined,
        floor: createForm.floor.trim() || undefined,
        capacity: parseInt(createForm.capacity) || 30,
        capacityTeams: createForm.capacityTeams ? parseInt(createForm.capacityTeams) : undefined,
        capacityPeople: createForm.capacityPeople ? parseInt(createForm.capacityPeople) : undefined,
        notes: createForm.notes.trim() || undefined,
      });
      toast('Room created', 'success');
      setShowCreate(false);
      setCreateForm({ name: '', code: '', description: '', building: '', floor: '', capacity: '30', capacityTeams: '', capacityPeople: '', notes: '' });
      fetchRooms();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  const totalOccupancy = rooms.reduce((sum, r) => sum + r.currentTeams, 0);

  if (!activeHackathon) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><DoorOpen className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
        <p className="text-title mb-2">No hackathon selected</p>
        <p className="text-caption">Select a hackathon to manage rooms.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-heading">Rooms</h1>
          <p className="text-caption mt-0.5">Manage event rooms and capacity</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Add room
          </button>
        )}
      </div>

      {/* Capacity overview */}
      {rooms.length > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label">Overall capacity</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {totalOccupancy} / {totalCapacity} assigned
            </p>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill progress-fill-accent"
              style={{ width: `${totalCapacity ? Math.min(100, (totalOccupancy / totalCapacity) * 100) : 0}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3">
            <span className="text-caption">{rooms.length} rooms</span>
            <span className="text-caption">{rooms.filter((r) => r.status === 'ACTIVE').length} active</span>
            <span className="text-caption" style={{ color: 'var(--red)' }}>{rooms.filter((r) => r.status === 'FULL').length} full</span>
          </div>
        </div>
      )}

      {/* Room grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="skeleton w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
              </div>
              <div className="skeleton h-2 w-full rounded-full mb-3" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><DoorOpen className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No rooms yet</p>
          <p className="text-caption mb-6">Create rooms to manage team assignments and capacity.</p>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add room
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map((room) => {
            const sc = STATUS_CONFIG[room.status] || STATUS_CONFIG.ACTIVE;
            const maxCap = Math.max(room.capacityTeams || room.capacityPeople || room.capacity, 1);
            const capLabel = room.capacityTeams ? `${room.currentTeams}/${room.capacityTeams}` : `${room.currentPeople}`;
            const occupancyPct = Math.min(100, Math.round((room.currentTeams / maxCap) * 100));
            return (
              <div key={room.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: sc.bg }}>
                      <DoorOpen className="w-4 h-4" style={{ color: sc.color }} />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ fontSize: 14 }}>{room.name}</p>
                      <p className="text-caption">{[room.building, room.floor].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}25` }}
                  >
                    {sc.label}
                  </span>
                </div>

                <div className="progress-track mb-2">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${occupancyPct}%`,
                      background: room.status === 'FULL' ? 'var(--red)' : 'var(--accent)',
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-caption">
                    <Users className="w-3 h-3 inline mr-1" style={{ verticalAlign: -1 }} />
                    {capLabel}{room.capacityPeople ? ` (${room.currentPeople} people)` : ''}
                  </p>
                  <p className="text-caption font-mono">{occupancyPct}%</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create room sheet */}
      {showCreate && (
        <>
          <div className="overlay animate-fade-in" onClick={() => setShowCreate(false)} />
          <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <DoorOpen className="w-4.5 h-4.5" style={{ color: 'var(--accent)', width: 18, height: 18 }} />
                </div>
                <div>
                  <h2 className="font-semibold" style={{ fontSize: 16 }}>Add room</h2>
                  <p className="text-caption">Create a new event room</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Room name *"
                className="input"
              />
              <input
                value={createForm.code}
                onChange={(e) => setCreateForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="Room code (optional)"
                className="input"
              />
              <input
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description (optional)"
                className="input"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={createForm.building}
                  onChange={(e) => setCreateForm((p) => ({ ...p, building: e.target.value }))}
                  placeholder="Building"
                  className="input"
                />
                <input
                  value={createForm.floor}
                  onChange={(e) => setCreateForm((p) => ({ ...p, floor: e.target.value }))}
                  placeholder="Floor"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={createForm.capacityTeams}
                  onChange={(e) => setCreateForm((p) => ({ ...p, capacityTeams: e.target.value }))}
                  placeholder="Max teams (optional)"
                  className="input"
                  min="1"
                />
                <input
                  type="number"
                  value={createForm.capacityPeople}
                  onChange={(e) => setCreateForm((p) => ({ ...p, capacityPeople: e.target.value }))}
                  placeholder="Max people (optional)"
                  className="input"
                  min="1"
                />
              </div>
              <input
                type="number"
                value={createForm.capacity}
                onChange={(e) => setCreateForm((p) => ({ ...p, capacity: e.target.value }))}
                placeholder="Legacy capacity (default 30)"
                className="input"
                min="1"
              />
              <textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Operational notes (optional)"
                className="input"
                rows={2}
              />
            </div>
            <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
              <button onClick={createRoom} disabled={creating || !createForm.name.trim()} className="btn btn-primary w-full" style={{ height: 48 }}>
                {creating ? 'Creating…' : 'Create room'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
