import { useEffect, useState } from 'react';
import { Zap, Plus, X, Clock, Play, Pause, Trash2, Calendar } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Automation {
  id: string;
  name: string;
  description?: string;
  triggerType: 'TIME_BASED' | 'EVENT_TRIGGERED';
  triggerConfig?: any;
  recipientGroup?: string;
  template?: string;
  templateSubject?: string;
  status: string;
  scheduledTime?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--green)', bg: 'var(--green-dim)' },
  PAUSED: { label: 'Paused', color: 'var(--yellow)', bg: 'var(--yellow-dim)' },
  SCHEDULED: { label: 'Scheduled', color: 'var(--blue)', bg: 'var(--blue-dim)' },
  PROCESSING: { label: 'Processing', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  COMPLETED: { label: 'Completed', color: 'var(--text-muted)', bg: 'var(--bg-muted)' },
  FAILED: { label: 'Failed', color: 'var(--red)', bg: 'var(--red-dim)' },
};

export function AutomationsPage() {
  const { activeHackathon } = useHackathonStore();
  const { user } = useAuthStore();
  const { toast } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    name: string; description: string; triggerType: 'TIME_BASED' | 'EVENT_TRIGGERED';
    scheduledTime: string; template: string; templateSubject: string; recipientGroup: string;
  }>({
    name: '', description: '', triggerType: 'TIME_BASED',
    scheduledTime: '', template: '', templateSubject: '', recipientGroup: '',
  });
  const [creating, setCreating] = useState(false);

  const fetch = async () => {
    if (!activeHackathon) return;
    setLoading(true);
    try {
      setAutomations(await api.get<Automation[]>(`/hackathons/${activeHackathon.id}/automations`));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [activeHackathon?.id]);

  const create = async () => {
    if (!activeHackathon || !form.name.trim()) return;
    setCreating(true);
    try {
      await api.post(`/hackathons/${activeHackathon.id}/automations`, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        triggerType: form.triggerType,
        scheduledTime: form.scheduledTime || undefined,
        template: form.template.trim() || undefined,
        templateSubject: form.templateSubject.trim() || undefined,
        recipientGroup: form.recipientGroup.trim() || undefined,
      });
      toast('Automation created', 'success');
      setShowCreate(false);
      setForm({ name: '', description: '', triggerType: 'TIME_BASED', scheduledTime: '', template: '', templateSubject: '', recipientGroup: '' });
      fetch();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const toggleStatus = async (a: Automation) => {
    if (!activeHackathon) return;
    const newStatus = a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await api.patch(`/hackathons/${activeHackathon.id}/automations/${a.id}`, { status: newStatus });
      toast(`${a.name} ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`, 'success');
      fetch();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const remove = async (a: Automation) => {
    if (!activeHackathon) return;
    try {
      await api.delete(`/hackathons/${activeHackathon.id}/automations/${a.id}`);
      toast('Automation deleted', 'success');
      fetch();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  if (!activeHackathon) {
    return (
      <div className="empty-state">
        <Zap className="w-5 h-5 empty-icon" style={{ color: 'var(--text-muted)' }} />
        <p className="text-title mb-2">No hackathon selected</p>
        <p className="text-caption">Select a hackathon to manage automations.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading">Automations</h1>
          <p className="text-caption mt-0.5">Scheduled messages and workflows</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> New automation
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-5 w-48 rounded mb-2" />
              <div className="skeleton h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Zap className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
          <p className="text-title mb-2">No automations</p>
          <p className="text-caption mb-6">Automate message broadcasts, certificate generation, and more.</p>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Create automation
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {automations.map((a) => {
            const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.PAUSED;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: sc.bg }}>
                      <Zap className="w-4 h-4" style={{ color: sc.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ fontSize: 14 }}>{a.name}</p>
                      {a.description && <p className="text-caption mt-0.5 truncate">{a.description}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}25` }}>
                          {sc.label}
                        </span>
                        <span className="text-caption flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {a.triggerType === 'TIME_BASED' ? 'Time-based' : 'Event-triggered'}
                        </span>
                        {a.scheduledTime && (
                          <span className="text-caption flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDateTime(a.scheduledTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleStatus(a)} className="btn btn-ghost btn-icon btn-sm" title={a.status === 'ACTIVE' ? 'Pause' : 'Activate'}>
                        {a.status === 'ACTIVE' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => remove(a)} className="btn btn-ghost btn-icon btn-sm" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  )}
                </div>
                {a.template && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                    {a.template}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <>
          <div className="overlay animate-fade-in" onClick={() => setShowCreate(false)} />
          <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <Zap className="w-4.5 h-4.5" style={{ color: 'var(--accent)', width: 18, height: 18 }} />
                </div>
                <div>
                  <h2 className="font-semibold" style={{ fontSize: 16 }}>New automation</h2>
                  <p className="text-caption">Schedule a message or workflow</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Automation name *" className="input" />
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" className="input" />
              <div>
                <p className="text-label mb-2">Trigger type</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['TIME_BASED', 'EVENT_TRIGGERED'] as const).map((t) => (
                    <button key={t} onClick={() => setForm((p) => ({ ...p, triggerType: t }))}
                      className="py-2.5 px-3 rounded-xl font-semibold transition-all"
                      style={{
                        fontSize: 12, background: form.triggerType === t ? 'var(--text)' : 'var(--bg-elevated)',
                        color: form.triggerType === t ? 'var(--bg)' : 'var(--text-secondary)',
                        border: form.triggerType === t ? '1px solid transparent' : '1px solid var(--border-strong)',
                      }}
                    >
                      {t === 'TIME_BASED' ? 'Time-based' : 'Event-triggered'}
                    </button>
                  ))}
                </div>
              </div>
              {form.triggerType === 'TIME_BASED' && (
                <div>
                  <p className="text-label mb-2">Schedule</p>
                  <input type="datetime-local" value={form.scheduledTime} onChange={(e) => setForm((p) => ({ ...p, scheduledTime: e.target.value }))} className="input" />
                </div>
              )}
              <div>
                <p className="text-label mb-2">Recipient group</p>
                <input value={form.recipientGroup} onChange={(e) => setForm((p) => ({ ...p, recipientGroup: e.target.value }))} placeholder="e.g. all, checked-in, active" className="input" />
              </div>
              <input value={form.templateSubject} onChange={(e) => setForm((p) => ({ ...p, templateSubject: e.target.value }))} placeholder="Template subject (optional)" className="input" />
              <textarea value={form.template} onChange={(e) => setForm((p) => ({ ...p, template: e.target.value }))} rows={3} placeholder="Template message (use {{teamName}}, {{hackathonName}})" className="input" />
            </div>
            <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
              <button onClick={create} disabled={creating || !form.name.trim()} className="btn btn-primary w-full" style={{ height: 48 }}>
                {creating ? 'Creating…' : 'Create automation'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
