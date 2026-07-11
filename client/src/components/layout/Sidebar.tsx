import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, MessageSquare, Award, Zap,
  ChevronDown, Plus, LogOut, Loader2, Check, Link2, Shield, ClipboardList,
  DoorOpen, Radio, Calendar, Activity, FileSpreadsheet, Send,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useHackathonStore, Hackathon } from '@/store/hackathonStore';
import { useUIStore } from '@/store/uiStore';
import { cn, initials } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { disconnectSocket } from '@/lib/socket';

const SUPER_ADMIN_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/hackathons', label: 'Hackathons', icon: Zap },
  { to: '/registrations', label: 'Registrations', icon: ClipboardList },
  { to: '/data-hub', label: 'Data Hub', icon: FileSpreadsheet },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/rooms', label: 'Rooms', icon: DoorOpen },
  { to: '/milestones', label: 'Milestones', icon: Calendar },
  { to: '/automations', label: 'Automations', icon: Activity },
  { to: '/operations', label: 'Live Ops', icon: Radio },
  { to: '/checkin', label: 'Check-in', icon: UserCheck },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/email', label: 'Email', icon: Send },
  { to: '/reliability', label: 'Reliability', icon: Shield },
  { to: '/certificates', label: 'Certificates', icon: Award },
  { to: '/admin', label: 'Admins', icon: Shield },
];

const SUB_ADMIN_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/checkin', label: 'Check-in', icon: UserCheck },
  { to: '/messages', label: 'Announcements', icon: MessageSquare },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { hackathons, activeHackathon, setActiveHackathon, loading } = useHackathonStore();
  const { setCreateHackathonOpen, setInviteOpen } = useUIStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isSubAdmin = user?.role === 'SUB_ADMIN';
  const navItems = useMemo(() => isAdmin ? SUPER_ADMIN_NAV : SUB_ADMIN_NAV, [isAdmin]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const handleLogout = () => {
    logout();
    disconnectSocket();
    navigate('/auth');
  };

  const statusColor = (status: string) => {
    if (status === 'ACTIVE') return 'var(--green)';
    if (status === 'ENDED') return 'var(--text-disabled)';
    return 'var(--yellow)';
  };

  return (
    <aside className="sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--text)', }}
          >
            <Zap className="w-4 h-4" style={{ color: 'var(--bg)' }} strokeWidth={2.5} />
          </div>
          <span
            className="font-display font-bold"
            style={{ fontSize: 15, color: 'var(--text)', letterSpacing: '-0.02em' }}
          >
            Nexora
          </span>
          {isAdmin && (
            <span
              className="ml-auto text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                background: 'var(--purple-dim)',
                color: 'var(--purple)',
                fontSize: 9,
                letterSpacing: '0.05em',
              }}
            >
              ADMIN
            </span>
          )}
        </div>

        {/* Hackathon switcher */}
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-colors duration-150',
            switcherOpen ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]'
          )}
          style={{ border: '1px solid transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          onMouseLeave={(e) => {
            if (!switcherOpen) e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 font-display font-bold"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', fontSize: 10, color: 'var(--text)' }}
          >
            {activeHackathon ? activeHackathon.name[0] : 'N'}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p
              className="font-medium truncate"
              style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}
            >
              {activeHackathon?.name || 'Select event'}
            </p>
            {activeHackathon && (
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: statusColor(activeHackathon.status),
                }}
              >
                {activeHackathon.status}
              </p>
            )}
          </div>
          <ChevronDown
            className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
            style={{
              color: 'var(--text-muted)',
              transform: switcherOpen ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </button>

        {switcherOpen && (
          <div
            className="mt-2 rounded-xl overflow-hidden animate-scale-in"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="py-1 max-h-44 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : hackathons.length === 0 ? (
                <p className="text-center py-4 text-caption">No hackathons</p>
              ) : (
                hackathons.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => { setActiveHackathon(h); setSwitcherOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100"
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center font-display font-bold flex-shrink-0"
                      style={{ fontSize: 9, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                    >
                      {h.name[0]}
                    </div>
                    <span className="flex-1 truncate font-medium" style={{ fontSize: 13, color: 'var(--text)' }}>
                      {h.name}
                    </span>
                    {activeHackathon?.id === h.id && (
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
                    )}
                  </button>
                ))
              )}
            </div>

            {isAdmin && (
              <>
                <div className="divider" />
                {activeHackathon && (
                  <button
                    onClick={() => { setSwitcherOpen(false); setInviteOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors duration-100"
                    style={{ fontSize: 13, color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Link2 className="w-3.5 h-3.5" /> Invite coordinators
                  </button>
                )}
                <button
                  onClick={() => { setSwitcherOpen(false); setCreateHackathonOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors duration-100"
                  style={{ fontSize: 13, color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Plus className="w-3.5 h-3.5" /> New hackathon
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-label px-2.5 mb-3">Navigation</p>
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => cn('nav-item', isActive && 'active')}
          >
            {({ isActive }) => (
              <>
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}

        {/* Always-visible create hackathon button for admins */}
        {isAdmin && (
          <div className="pt-3 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-label px-2.5 mb-2">Actions</p>
            <button
              onClick={() => setCreateHackathonOpen(true)}
              className="nav-item w-full text-left"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
              }}
            >
              <Plus className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
              New hackathon
            </button>
            {activeHackathon && (
              <button
                onClick={() => setInviteOpen(true)}
                className="nav-item w-full text-left mt-0.5"
              >
                <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                Invite coordinator
              </button>
            )}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div
            className="avatar avatar-sm flex-shrink-0 font-display"
            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
          >
            {initials(user?.name || 'U')}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-medium truncate"
              style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.3 }}
            >
              {user?.name || 'User'}
            </p>
            <p className="truncate text-caption">
              {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Sub Admin'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-100"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-dim)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
