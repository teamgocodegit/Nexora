import { useEffect, useState } from 'react';
import { Calendar, Plus, X, Trash2, Edit3, Check, Clock } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';

interface Milestone {
  id: string;
  title: string;
  time: string;
  description?: string;
  hackathonId: string;
}

export function MilestonesPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState({ title: '', time: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      setMilestones(await api.get<Milestone[]>(`/hackathons/${activeHackathon.id}/milestones`));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [activeHackathon?.id]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', time: '', description: '' });
    setShowForm(true);
  };

  const openEdit = (m: Milestone) => {
    setEditing(m);
    setForm({ title: m.title, time: m.time, description: m.description || '' });
    setShowForm(true);
  };

  const save = async () => {
    if (!activeHackathon || !form.title.trim() || !form.time.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/hackathons/${activeHackathon.id}/milestones/${editing.id}`, form);
        toast('Milestone updated', 'success');
      } else {
        await api.post(`/hackathons/${activeHackathon.id}/milestones`, form);
        toast('Milestone created', 'success');
      }
      setShowForm(false);
      fetch();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (m: Milestone) => {
    if (!activeHackathon) return;
    try {
      await api.delete(`/hackathons/${activeHackathon.id}/milestones/${m.id}`);
      toast('Milestone deleted', 'success');
      fetch();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const now = new Date();
  const past = milestones.filter((m) => new Date(m.time) <= now);
  const upcoming = milestones.filter((m) => new Date(m.time) > now);

  if (!activeHackathon) {
    return (
      <div className="empty-state">
        <Calendar className="w-5 h-5 empty-icon" style={{ color: 'var(--text-muted)' }} />
        <p className="text-title mb-2">No hackathon selected</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading">Milestones</h1>
          <p className="text-caption mt-0.5">Event timeline and schedule</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Add milestone
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-5 w-48 rounded" />
            </div>
          ))}
        </div>
      ) : milestones.length === 0 ? (
        <div className="empty-state">
          <Calendar className="w-5 h-5 empty-icon" style={{ color: 'var(--text-muted)' }} />
          <p className="text-title mb-2">No milestones</p>
          <p className="text-caption mb-6">Add event milestones to build a timeline.</p>
          {isAdmin && (
            <button onClick={openCreate} className="btn btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add milestone
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-[2px]" style={{ background: 'var(--border)' }} />

          <div className="space-y-4 ml-4">
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div className="mb-4">
                <p className="text-label mb-3">Upcoming</p>
                {upcoming.map((m) => (
                  <MilestoneCard key={m.id} milestone={m} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove} isPast={false} />
                ))}
              </div>
            )}

            {/* Past */}
            {past.length > 0 && (
              <div>
                <p className="text-label mb-3">Past</p>
                {past.map((m) => (
                  <MilestoneCard key={m.id} milestone={m} isAdmin={isAdmin} onEdit={openEdit} onDelete={remove} isPast={true} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <>
          <div className="overlay animate-fade-in" onClick={() => setShowForm(false)} />
          <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '70vh' }}>
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-semibold" style={{ fontSize: 16 }}>{editing ? 'Edit' : 'Add'} milestone</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title *" className="input" />
              <input type="datetime-local" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} className="input" />
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder="Description (optional)" className="input" />
            </div>
            <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
              <button onClick={save} disabled={saving || !form.title.trim() || !form.time.trim()} className="btn btn-primary w-full">
                {saving ? 'Saving…' : editing ? 'Update milestone' : 'Add milestone'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MilestoneCard({ milestone: m, isAdmin, onEdit, onDelete, isPast }: {
  milestone: Milestone; isAdmin: boolean; onEdit: (m: Milestone) => void; onDelete: (m: Milestone) => void; isPast: boolean;
}) {
  const date = new Date(m.time);
  return (
    <div className="relative flex items-start gap-4">
      {/* Timeline dot */}
      <div className="absolute -left-[18px] top-2 w-4 h-4 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: isPast ? 'var(--green)' : 'var(--accent)', background: isPast ? 'var(--green-dim)' : 'var(--bg-card)' }}>
        {isPast ? <Check className="w-2.5 h-2.5" style={{ color: 'var(--green)' }} /> : null}
      </div>

      <div className="card p-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold" style={{ fontSize: 14 }}>{m.title}</p>
              {isPast && <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)', fontSize: 10 }}>Done</span>}
            </div>
            {m.description && <p className="text-caption mt-1">{m.description}</p>}
            <p className="text-caption mt-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              {' at '}
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onEdit(m)} className="btn btn-ghost btn-icon btn-sm" title="Edit">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(m)} className="btn btn-ghost btn-icon btn-sm" title="Delete">
                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
