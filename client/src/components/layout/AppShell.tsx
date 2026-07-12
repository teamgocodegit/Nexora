import { Outlet, NavLink } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { LayoutDashboard, Users, UserCheck, MessageSquare, Award, Shield, DoorOpen, Radio, Printer } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useHackathonStore } from '@/store/hackathonStore';
import { useTeamsStore } from '@/store/teamsStore';
import { useUIStore } from '@/store/uiStore';
import { joinHackathon, leaveHackathon, getSocket } from '@/lib/socket';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { BroadcastSheet } from '@/components/broadcast/BroadcastSheet';
import { SheetsSheet } from '@/components/teams/SheetsSheet';
import { CreateHackathonSheet } from '@/components/hackathons/CreateHackathonSheet';
import { CreateTeamSheet } from '@/components/teams/CreateTeamSheet';
import { InviteSheet } from '@/components/hackathons/InviteSheet';
import { Toasts } from '@/components/ui/Toasts';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const { activeHackathon, fetchHackathons } = useHackathonStore();
  const bottomNav = useMemo(() => isAdmin
    ? [
        { to: '/', label: 'Home', icon: LayoutDashboard, exact: true },
        { to: '/teams', label: 'Teams', icon: Users },
        { to: '/checkin', label: 'Check-in', icon: UserCheck },
        { to: '/messages', label: 'Msgs', icon: MessageSquare },
        { to: '/rooms', label: 'Rooms', icon: DoorOpen },
        { to: '/operations', label: 'Ops', icon: Radio },
        { to: '/print', label: 'Print', icon: Printer },
        { to: '/certificates', label: 'Certs', icon: Award },
        { to: '/admin', label: 'Admins', icon: Shield },
      ]
    : [
        { to: '/', label: 'Home', icon: LayoutDashboard, exact: true },
        { to: '/teams', label: 'Teams', icon: Users },
        { to: '/checkin', label: 'Check-in', icon: UserCheck },
        { to: '/messages', label: 'News', icon: MessageSquare },
      ],
  [isAdmin]);
  const { fetchTeams, upsertTeam } = useTeamsStore();
  const { broadcastOpen, sheetsOpen, createHackathonOpen, commandOpen, createTeamOpen, inviteOpen } = useUIStore();

  useEffect(() => { fetchHackathons(); }, []);

  useEffect(() => {
    if (!activeHackathon) return;
    fetchTeams(activeHackathon.id);
    const socket = getSocket();
    joinHackathon(activeHackathon.id);
    const onTeamUpdated = ({ payload }: any) => upsertTeam(payload);
    const onTeamCheckIn = ({ payload }: any) => upsertTeam(payload.team);
    socket.on('team:updated', onTeamUpdated);
    socket.on('team:checkin', onTeamCheckIn);
    return () => {
      leaveHackathon(activeHackathon.id);
      socket.off('team:updated', onTeamUpdated);
      socket.off('team:checkin', onTeamCheckIn);
    };
  }, [activeHackathon?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useUIStore.getState().setCommandOpen(true);
      }
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        useUIStore.getState().setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="ambient-bg">
      {/* Desktop: sidebar + main */}
      <div
        className="hidden md:grid"
        style={{ gridTemplateColumns: '220px 1fr', minHeight: '100vh' }}
      >
        <Sidebar />
        <main
          className="min-h-screen overflow-auto"
          style={{ borderLeft: '1px solid var(--border)' }}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile: topbar + content + bottom nav */}
      <div className="md:hidden min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto pb-nav">
          <Outlet />
        </main>

        <nav className="bottom-nav">
          {bottomNav.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className="bottom-nav-item"
            >
              {({ isActive }) => (
                <>
                  <div
                    className="flex items-center justify-center rounded-xl transition-all duration-150"
                    style={{
                      width: 40,
                      height: 26,
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                      border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
                    }}
                  >
                    <Icon
                      style={{
                        color: isActive ? 'var(--text)' : 'var(--text-muted)',
                        strokeWidth: isActive ? 2.5 : 1.75,
                        width: 17,
                        height: 17,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      letterSpacing: '0.02em',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Global overlays */}
      {commandOpen && <CommandPalette />}
      {broadcastOpen && <BroadcastSheet />}
      {sheetsOpen && <SheetsSheet />}
      {createHackathonOpen && <CreateHackathonSheet />}
      {createTeamOpen && <CreateTeamSheet />}
      {inviteOpen && <InviteSheet />}
      <Toasts />
    </div>
  );
}
