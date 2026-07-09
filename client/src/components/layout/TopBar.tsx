import { Search, Plus, ChevronDown, Zap, Link2 } from 'lucide-react';
import { useHackathonStore } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { cn, initials } from '@/lib/utils';
import { useState } from 'react';

export function TopBar() {
  const { activeHackathon, hackathons, setActiveHackathon } = useHackathonStore();
  const { setCommandOpen, setCreateHackathonOpen, setInviteOpen } = useUIStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isSubAdmin = user?.role === 'SUB_ADMIN';
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 pt-safe"
          style={{
            height: 56,
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border)',
          }}
      >
        {/* Left: Logo + switcher */}
        <button
          onClick={() => setSwitcherOpen(true)}
          className="flex items-center gap-2.5 press min-w-0"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--text)' }}
          >
            <Zap className="w-3.5 h-3.5" style={{ color: 'var(--bg)' }} strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="font-display font-bold truncate"
              style={{ fontSize: 14, color: 'var(--text)', maxWidth: 130, letterSpacing: '-0.02em' }}
            >
              {activeHackathon?.name || 'Nexora'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </div>
        </button>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCommandOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Search className="w-4 h-4" />
          </button>
          {isAdmin && (
            <>
              {activeHackathon && (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Link2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setCreateHackathonOpen(true)}
                className="btn btn-primary btn-icon btn-sm ml-1"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </>
          )}
          {isSubAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
              <span className="text-caption">Sub Admin</span>
            </div>
          )}
          <div
            className="avatar avatar-sm ml-1.5 flex-shrink-0 font-display"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            {initials(user?.name || 'U')}
          </div>
        </div>
      </header>

      {/* Switcher sheet */}
      {switcherOpen && (
        <>
          <div className="overlay animate-fade-in" onClick={() => setSwitcherOpen(false)} />
          <div className="sheet animate-slide-up flex flex-col" style={{ maxHeight: '65vh' }}>
            <div className="sheet-handle" />
            <div className="px-5 pb-4">
              <p className="text-label mb-4">Switch hackathon</p>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 260 }}>
                {hackathons.map((h) => {
                  const isActive = activeHackathon?.id === h.id;
                  return (
                    <button
                      key={h.id}
                      onClick={() => { setActiveHackathon(h); setSwitcherOpen(false); }}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-all duration-100'
                      )}
                      style={{
                        background: isActive ? 'var(--bg-elevated)' : 'var(--bg-card)',
                        border: isActive ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <p
                          className="font-display font-bold"
                          style={{ fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em' }}
                        >
                          {h.name}
                        </p>
                        <p className="text-caption mt-0.5">
                          {h._count?.teams ?? 0} teams · {h.status}
                        </p>
                      </div>
                      {isActive && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--green-dim)' }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {isAdmin && (
                <button
                  onClick={() => { setSwitcherOpen(false); setCreateHackathonOpen(true); }}
                  className="w-full flex items-center justify-center gap-2 mt-3 py-3 rounded-xl transition-colors duration-100"
                  style={{
                    border: '1px dashed var(--border-strong)',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Plus className="w-4 h-4" /> New hackathon
                </button>
              )}
              <div style={{ height: 'var(--safe-bottom)', paddingBottom: 12 }} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
