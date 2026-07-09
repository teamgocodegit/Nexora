import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { slugify } from '@/lib/utils';

export function CreateHackathonSheet() {
  const { setCreateHackathonOpen, toast } = useUIStore();
  const { createHackathon } = useHackathonStore();
  const [form, setForm] = useState({
    name: '',
    description: '',
    venue: '',
    startDate: '',
    endDate: '',
    maxTeams: '',
    mode: 'PREDEFINED' as 'PREDEFINED' | 'ON_SPOT',
    slug: '',
    minTeamSize: '1',
    maxTeamSize: '5',
    approvalRequired: true,
    waitlistEnabled: false,
  });
  const [loading, setLoading] = useState(false);
  const close = () => setCreateHackathonOpen(false);

  const handleNameChange = (name: string) => {
    setForm((p) => ({
      ...p,
      name,
      slug: p.slug === slugify(p.name) ? slugify(name) : p.slug,
    }));
  };

  const submit = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast('Name and dates are required', 'error');
      return;
    }
    setLoading(true);
    try {
      await createHackathon({
        name: form.name,
        description: form.description || undefined,
        venue: form.venue || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        maxTeams: form.maxTeams ? parseInt(form.maxTeams) : undefined,
        mode: form.mode,
        slug: form.slug || slugify(form.name),
        minTeamSize: parseInt(form.minTeamSize) || 1,
        maxTeamSize: parseInt(form.maxTeamSize) || 5,
        approvalRequired: form.approvalRequired,
        waitlistEnabled: form.waitlistEnabled,
      });
      toast(`"${form.name}" created!`, 'success');
      close();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const f =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <div className="overlay animate-fade-in" onClick={close} />
      <div
        className="sheet animate-slide-up flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        <div className="sheet-handle" />

        <div
          className="flex items-center justify-between px-5 pb-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--text)' }}
            >
              <Zap className="w-4.5 h-4.5" style={{ color: '#FFFFFF', width: 18, height: 18 }} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-display font-bold" style={{ fontSize: 17, letterSpacing: '-0.02em' }}>
                New hackathon
              </h2>
              <p className="text-caption mt-0.5">Create an event workspace</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <input
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Hackathon name *"
            className="input"
          />
          <input
            value={form.slug}
            onChange={f('slug')}
            placeholder="URL slug (e.g. hacksprint-2026)"
            className="input font-mono"
            style={{ fontSize: 13 }}
          />
          <textarea
            value={form.description}
            onChange={f('description')}
            placeholder="Description (optional)"
            className="input"
            rows={2}
          />
          <input
            value={form.venue}
            onChange={f('venue')}
            placeholder="Venue (optional)"
            className="input"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-caption mb-1.5">Start date *</p>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={f('startDate')}
                className="input"
                style={{ fontSize: 13 }}
              />
            </div>
            <div>
              <p className="text-caption mb-1.5">End date *</p>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={f('endDate')}
                className="input"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <div className="divider" />

          <p className="text-label">Registration settings</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-caption mb-1.5">Min team size</p>
              <input type="number" value={form.minTeamSize} onChange={f('minTeamSize')} className="input" min="1" />
            </div>
            <div>
              <p className="text-caption mb-1.5">Max team size</p>
              <input type="number" value={form.maxTeamSize} onChange={f('maxTeamSize')} className="input" min="1" />
            </div>
          </div>

          <input
            type="number"
            value={form.maxTeams}
            onChange={f('maxTeams')}
            placeholder="Max teams (0 = unlimited)"
            className="input"
          />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.approvalRequired}
                onChange={(e) => setForm((p) => ({ ...p, approvalRequired: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm">Manual approval required</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.waitlistEnabled}
                onChange={(e) => setForm((p) => ({ ...p, waitlistEnabled: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm">Enable waitlist when full</span>
            </label>
          </div>

          <div className="divider" />

          <p className="text-label">Problem statement mode</p>
          <select value={form.mode} onChange={f('mode')} className="input">
            <option value="PREDEFINED">Predefined — teams choose a problem</option>
            <option value="ON_SPOT">On-spot — coordinators assign problems</option>
          </select>
        </div>

        <div
          className="px-5 py-4 border-t"
          style={{
            borderColor: 'var(--border)',
            paddingBottom: 'calc(16px + var(--safe-bottom))',
          }}
        >
          <button
            onClick={submit}
            disabled={loading}
            className="btn btn-primary w-full"
            style={{ height: 48, fontSize: 15 }}
          >
            {loading ? (
              <div className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {loading ? 'Creating…' : 'Create hackathon'}
          </button>
        </div>
      </div>
    </>
  );
}
