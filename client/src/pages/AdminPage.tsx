import { useEffect, useState } from 'react';
import { Shield, Plus, X, Check, Search, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  lastActivityAt?: string;
  assignedRooms?: string;
  createdAt: string;
  assignments?: { hackathonId: string; hackathon: { id: string; name: string } }[];
}

export function AdminPage() {
  const { user } = useAuthStore();
  const { activeHackathon, hackathons } = useHackathonStore();
  const { toast } = useUIStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', hackathonId: '', assignedRooms: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setAdmins(await api.get<AdminUser[]>('/admin'));
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', email: '', phone: '', hackathonId: activeHackathon?.id || '', assignedRooms: '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (a: AdminUser) => {
    setForm({
      name: a.name,
      email: a.email || '',
      phone: a.phone || '',
      hackathonId: a.assignments?.[0]?.hackathonId || '',
      assignedRooms: a.assignedRooms || '',
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/admin/${editingId}`, form);
        toast('Admin updated', 'success');
      } else {
        await api.post('/admin', form);
        toast('Admin created', 'success');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async (a: AdminUser) => {
    try {
      await api.patch(`/admin/${a.id}`, { isActive: !a.isActive });
      toast(`${a.name} ${a.isActive ? 'deactivated' : 'activated'}`, 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleDelete = async (a: AdminUser) => {
    if (!confirm(`Delete ${a.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/${a.id}`);
      toast('Admin deleted', 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-5 py-6">
        <div className="empty-state">
          <Shield className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-title mt-4 mb-1">Access restricted</p>
          <p className="text-caption">Only Super Admins can manage sub-admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading">Admins</h1>
          <p className="text-caption mt-0.5">{admins.length} sub-admin{admins.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> Add admin
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="card p-5 mb-5" style={{ border: '1px solid var(--border-accent)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-title">{editingId ? 'Edit' : 'Add'} Sub Admin</p>
            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-icon btn-sm">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input className="input" placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select className="input" value={form.hackathonId}
              onChange={(e) => setForm({ ...form, hackathonId: e.target.value })}>
              <option value="">No hackathon assigned</option>
              {hackathons.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
            <input className="input" placeholder="Assigned rooms (comma-separated)" value={form.assignedRooms}
              onChange={(e) => setForm({ ...form, assignedRooms: e.target.value })} />
            <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
              {submitting ? <div className="spinner-white" style={{ width: 14, height: 14 }} /> : (editingId ? 'Update' : 'Create')}
            </button>
          </div>
        </div>
      )}

      {/* Admin list */}
      {loading ? (
        <div className="card overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="skeleton w-8 h-8 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32 rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : admins.length === 0 ? (
        <div className="empty-state">
          <Shield className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-title mt-4 mb-1">No sub-admins yet</p>
          <p className="text-caption mb-4">Add coordinators to help manage hackathons.</p>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> Add admin
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold flex-shrink-0"
                style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>
                {a.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ fontSize: 14 }}>{a.name}</p>
                <p className="text-caption truncate">
                  {a.email || 'No email'} · {a.assignments?.[0]?.hackathon?.name || 'Unassigned'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={cn('badge', a.isActive ? 'badge-checked_in' : 'badge-disqualified')}>
                  {a.isActive ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => openEdit(a)} className="btn btn-ghost btn-icon btn-sm" title="Edit">
                  <Search className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleStatus(a)} className="btn btn-ghost btn-icon btn-sm"
                  title={a.isActive ? 'Deactivate' : 'Activate'}
                  style={{ color: a.isActive ? 'var(--orange)' : 'var(--green)' }}>
                  {a.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => handleDelete(a)} className="btn btn-ghost btn-icon btn-sm"
                  style={{ color: 'var(--red)' }} title="Delete">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
