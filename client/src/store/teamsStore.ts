import { create } from 'zustand';
import { api } from '@/lib/api';

export type TeamStatus =
  | 'REGISTERED'
  | 'CHECKED_IN'
  | 'ACTIVE'
  | 'SUBMITTED'
  | 'DISQUALIFIED';

export interface Participant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isLeader: boolean;
}

export interface Team {
  id: string;
  hackathonId: string;
  teamId?: string;
  qrToken?: string;
  name: string;
  status: TeamStatus;
  room?: string;
  tableNumber?: string;
  projectName?: string;
  projectUrl?: string;
  notes?: string;
  leaderPhone?: string;
  checkInTime?: string;
  checkInBy?: string;
  submissionTime?: string;
  coordinatorId?: string;
  coordinator?: { id: string; name: string } | null;
  problemStatement?: { id: string; title: string } | null;
  participants: Participant[];
  createdAt: string;
  updatedAt: string;
}

interface TeamsState {
  teams: Team[];
  loading: boolean;
  search: string;
  statusFilter: TeamStatus | 'ALL';
  selectedTeam: Team | null;

  fetchTeams: (hackathonId: string) => Promise<void>;
  createTeam: (hackathonId: string, data: Partial<Team>) => Promise<Team>;
  updateTeam: (hackathonId: string, id: string, data: Partial<Team>) => Promise<Team>;
  deleteTeam: (hackathonId: string, id: string) => Promise<void>;
  checkIn: (hackathonId: string, id: string) => Promise<Team>;
  undoCheckIn: (hackathonId: string, id: string) => Promise<Team>;
  upsertTeam: (team: Team) => void;

  setSearch: (s: string) => void;
  setStatusFilter: (s: TeamStatus | 'ALL') => void;
  setSelectedTeam: (t: Team | null) => void;
  getFiltered: () => Team[];
}

export const useTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  loading: false,
  search: '',
  statusFilter: 'ALL',
  selectedTeam: null,

  fetchTeams: async (hackathonId) => {
    set({ loading: true });
    try {
      const teams = await api.get<Team[]>(`/hackathons/${hackathonId}/teams`);
      set({ teams, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createTeam: async (hackathonId, data) => {
    const team = await api.post<Team>(`/hackathons/${hackathonId}/teams`, data);
    get().upsertTeam(team);
    return team;
  },

  updateTeam: async (hackathonId, id, data) => {
    const team = await api.patch<Team>(
      `/hackathons/${hackathonId}/teams/${id}`,
      data
    );
    get().upsertTeam(team);
    if (get().selectedTeam?.id === id) set({ selectedTeam: team });
    return team;
  },

  deleteTeam: async (hackathonId, id) => {
    await api.delete(`/hackathons/${hackathonId}/teams/${id}`);
    set((s) => ({ teams: s.teams.filter((t) => t.id !== id) }));
    if (get().selectedTeam?.id === id) set({ selectedTeam: null });
  },

  checkIn: async (hackathonId, id) => {
    const team = await api.post<Team>(
      `/hackathons/${hackathonId}/teams/${id}/checkin`
    );
    get().upsertTeam(team);
    if (get().selectedTeam?.id === id) set({ selectedTeam: team });
    return team;
  },

  undoCheckIn: async (hackathonId, id) => {
    const team = await api.post<Team>(
      `/hackathons/${hackathonId}/teams/${id}/undo-checkin`
    );
    get().upsertTeam(team);
    return team;
  },

  upsertTeam: (team) => {
    set((s) => {
      const idx = s.teams.findIndex((t) => t.id === team.id);
      if (idx >= 0) {
        const updated = [...s.teams];
        updated[idx] = team;
        return { teams: updated };
      }
      return { teams: [team, ...s.teams] };
    });
  },

  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSelectedTeam: (selectedTeam) => set({ selectedTeam }),

  getFiltered: () => {
    const { teams, search, statusFilter } = get();
    return teams.filter((t) => {
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.participants.some((p) => p.name.toLowerCase().includes(q)) ||
        t.room?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  },
}));
